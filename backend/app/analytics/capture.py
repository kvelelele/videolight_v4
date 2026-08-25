from __future__ import annotations

import asyncio
import logging
import subprocess
import threading
from collections.abc import AsyncIterator

import cv2
import numpy as np

from app.streaming import (
    FFMPEG_BIN,
    FFPROBE_BIN,
    _ffmpeg_input_args,
    ffmpeg_available,
    ffprobe_available,
    is_hls_url,
)

logger = logging.getLogger(__name__)

INFERENCE_WIDTH = 640
PROBE_TIMEOUT_SEC = 15
# Fallback when ffprobe cannot read live HLS metadata (common for Skyline).
DEFAULT_SIZE = (1280, 720)


def _even(value: int) -> int:
    return value if value % 2 == 0 else value - 1


def scaled_size(orig_w: int, orig_h: int, target_w: int = INFERENCE_WIDTH) -> tuple[int, int]:
    inf_h = _even(int(orig_h * target_w / orig_w))
    return target_w, max(inf_h, 2)


def _probe_video_size_sync(source_url: str) -> tuple[int, int]:
    """Sync ffprobe — asyncio subprocess is NotImplemented on some Windows loops."""
    if not ffprobe_available():
        raise RuntimeError("ffprobe не найден — установите FFmpeg и добавьте в PATH")

    cmd = [
        FFPROBE_BIN,
        "-v",
        "error",
        "-analyzeduration",
        "10M",
        "-probesize",
        "10M",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        *_ffmpeg_input_args(source_url),
    ]
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            timeout=PROBE_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Таймаут при определении размера видео") from exc

    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip() or "Не удалось открыть поток"
        raise RuntimeError(detail)

    text = completed.stdout.decode("utf-8", errors="replace").strip()
    line = next((ln.strip() for ln in text.splitlines() if "x" in ln), "")
    parts = line.split("x")
    if len(parts) != 2:
        raise RuntimeError(f"Не удалось определить размер кадра: {text!r}")

    try:
        w, h = int(parts[0]), int(parts[1])
    except ValueError as exc:
        raise RuntimeError(f"Некорректный размер кадра: {line!r}") from exc
    if w <= 0 or h <= 0:
        raise RuntimeError(f"Некорректный размер кадра: {line!r}")
    return w, h


def _resolve_size(source_url: str) -> tuple[int, int]:
    try:
        return _probe_video_size_sync(source_url)
    except Exception as exc:
        logger.warning(
            "ffprobe size failed for %s (%s); using fallback %sx%s",
            source_url,
            exc,
            DEFAULT_SIZE[0],
            DEFAULT_SIZE[1],
        )
        return DEFAULT_SIZE


def _read_exact_sync(stream, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            raise EOFError("unexpected end of ffmpeg stdout")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def _read_jpeg_frame_sync(stream, leftover: bytearray) -> np.ndarray:
    """Read one MJPEG frame from a pipe (size unknown ahead of time)."""
    while True:
        start = leftover.find(b"\xff\xd8")
        if start < 0:
            chunk = stream.read(65536)
            if not chunk:
                raise EOFError("unexpected end of ffmpeg stdout")
            leftover.extend(chunk)
            if len(leftover) > 8_000_000:
                leftover.clear()
            continue
        if start > 0:
            del leftover[:start]

        end = leftover.find(b"\xff\xd9", 2)
        while end < 0:
            chunk = stream.read(65536)
            if not chunk:
                raise EOFError("unexpected end of ffmpeg stdout")
            leftover.extend(chunk)
            end = leftover.find(b"\xff\xd9", 2)
            if len(leftover) > 8_000_000:
                raise RuntimeError("MJPEG frame too large")

        jpeg = bytes(leftover[: end + 2])
        del leftover[: end + 2]
        frame = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            continue
        return frame


async def iter_frames(source_url: str) -> AsyncIterator[tuple[np.ndarray, int, int, int, int]]:
    """Yield BGR frames scaled for inference plus original/scaled dimensions."""
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg не найден — установите FFmpeg и добавьте в PATH")

    orig_w, orig_h = await asyncio.to_thread(_resolve_size, source_url)
    inf_w, inf_h = scaled_size(orig_w, orig_h)
    use_mjpeg = is_hls_url(source_url)
    frame_bytes = inf_w * inf_h * 3

    low_latency = [
        "-fflags",
        "nobuffer",
        "-flags",
        "low_delay",
    ]

    if use_mjpeg:
        # MJPEG pipe: no hard dependency on exact raw frame byte size.
        vf = f"scale={inf_w}:{inf_h}"
        out_args = ["-an", "-vf", vf, "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "5", "-"]
    else:
        vf = f"scale={inf_w}:{inf_h}"
        out_args = ["-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]

    cmd = [
        FFMPEG_BIN,
        "-hide_banner",
        "-loglevel",
        "error",
        *low_latency,
        *_ffmpeg_input_args(source_url),
        *out_args,
    ]

    # IMPORTANT: never use stderr=PIPE without a drain thread — full stderr deadlocks ffmpeg.
    proc = await asyncio.to_thread(
        lambda: subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
    )
    assert proc.stdout is not None
    leftover = bytearray()
    stop_reader = threading.Event()

    try:
        while not stop_reader.is_set():
            try:
                if use_mjpeg:
                    frame = await asyncio.to_thread(_read_jpeg_frame_sync, proc.stdout, leftover)
                    # Prefer actual decoded size if scale drifted.
                    h, w = frame.shape[:2]
                    if (w, h) != (inf_w, inf_h):
                        frame = cv2.resize(frame, (inf_w, inf_h), interpolation=cv2.INTER_AREA)
                else:
                    data = await asyncio.to_thread(_read_exact_sync, proc.stdout, frame_bytes)
                    frame = np.frombuffer(data, dtype=np.uint8).reshape((inf_h, inf_w, 3)).copy()
            except EOFError:
                break
            yield frame, orig_w, orig_h, inf_w, inf_h
    finally:
        stop_reader.set()
        if proc.poll() is None:
            proc.kill()
            await asyncio.to_thread(proc.wait)
