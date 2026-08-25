from __future__ import annotations

import asyncio
import logging
import subprocess
from collections.abc import AsyncIterator

import numpy as np

from app.streaming import (
    FFPROBE_BIN,
    FFMPEG_BIN,
    _ffmpeg_input_args,
    ffprobe_available,
    ffmpeg_available,
)

logger = logging.getLogger(__name__)

INFERENCE_WIDTH = 640
PROBE_TIMEOUT_SEC = 15


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

    return int(parts[0]), int(parts[1])


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


async def iter_frames(source_url: str) -> AsyncIterator[tuple[np.ndarray, int, int, int, int]]:
    """Yield BGR frames scaled for inference plus original/scaled dimensions."""
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg не найден — установите FFmpeg и добавьте в PATH")

    orig_w, orig_h = await asyncio.to_thread(_probe_video_size_sync, source_url)
    inf_w, inf_h = scaled_size(orig_w, orig_h)
    frame_bytes = inf_w * inf_h * 3

    cmd = [
        FFMPEG_BIN,
        "-hide_banner",
        "-loglevel",
        "error",
        *_ffmpeg_input_args(source_url),
        "-an",
        "-vf",
        f"scale={inf_w}:{inf_h}",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-",
    ]

    # Windows asyncio SelectorEventLoop cannot spawn subprocesses.
    proc = await asyncio.to_thread(
        lambda: subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=frame_bytes * 2,
        )
    )
    assert proc.stdout is not None

    try:
        while True:
            try:
                data = await asyncio.to_thread(_read_exact_sync, proc.stdout, frame_bytes)
            except EOFError:
                break
            frame = np.frombuffer(data, dtype=np.uint8).reshape((inf_h, inf_w, 3)).copy()
            yield frame, orig_w, orig_h, inf_w, inf_h
    finally:
        if proc.poll() is None:
            proc.kill()
            await asyncio.to_thread(proc.wait)
        if proc.returncode not in (0, None) and proc.stderr is not None:
            err = await asyncio.to_thread(lambda: proc.stderr.read().decode("utf-8", errors="replace").strip())
            if err:
                logger.warning("FFmpeg capture ended: %s", err)
