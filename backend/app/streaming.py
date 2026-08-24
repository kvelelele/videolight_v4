import asyncio
import shutil
from collections.abc import AsyncIterator

import httpx

FFMPEG_BIN = "ffmpeg"
FFPROBE_BIN = "ffprobe"
PROBE_TIMEOUT_SEC = 5
CHUNK_SIZE = 16384


def ffmpeg_available() -> bool:
    return shutil.which(FFMPEG_BIN) is not None


def ffprobe_available() -> bool:
    return shutil.which(FFPROBE_BIN) is not None


def is_hls_url(source_url: str) -> bool:
    path = source_url.lower().split("?")[0]
    return ".m3u8" in path


def needs_ffmpeg_transcode(source_url: str) -> bool:
    lower = source_url.lower()
    return is_hls_url(source_url) or any(ext in lower for ext in (".mp4", ".webm", ".mov", ".ogg"))


def _ffmpeg_input_args(source_url: str) -> list[str]:
    args: list[str] = []
    lower = source_url.lower()
    if lower.startswith("rtsp://"):
        args.extend(["-rtsp_transport", "tcp"])
    if is_hls_url(source_url):
        args.extend([
            "-protocol_whitelist",
            "file,http,https,tcp,tls,crypto",
            "-reconnect",
            "1",
            "-reconnect_streamed",
            "1",
            "-reconnect_delay_max",
            "5",
        ])
    args.extend(["-i", source_url])
    return args


async def test_stream_url(source_url: str) -> tuple[bool, str]:
    if not source_url.strip():
        return False, "URL источника не указан"

    if not ffprobe_available():
        return False, "ffprobe не найден — установите FFmpeg и добавьте в PATH"

    cmd = [
        FFPROBE_BIN,
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        *_ffmpeg_input_args(source_url),
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=PROBE_TIMEOUT_SEC)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return False, "Таймаут подключения к источнику"

        if proc.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace").strip() or "Не удалось открыть поток"
            return False, detail

        return True, "Подключение успешно"
    except FileNotFoundError:
        return False, "ffprobe не найден — установите FFmpeg"
    except Exception as exc:
        return False, str(exc)


async def ffmpeg_mjpeg_stream(source_url: str) -> AsyncIterator[bytes]:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg не найден — установите FFmpeg и добавьте в PATH")

    cmd = [
        FFMPEG_BIN,
        "-hide_banner",
        "-loglevel",
        "error",
        *_ffmpeg_input_args(source_url),
        "-an",
        "-f",
        "mpjpeg",
        "-q:v",
        "5",
        "-",
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    assert proc.stdout is not None

    try:
        while True:
            chunk = await proc.stdout.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


async def proxy_http_stream(source_url: str) -> AsyncIterator[bytes]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=None)) as client:
        async with client.stream("GET", source_url) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(CHUNK_SIZE):
                yield chunk
