import asyncio
import shutil
from collections.abc import AsyncIterator
from urllib.parse import quote, urljoin, urlparse

import httpx

FFMPEG_BIN = "ffmpeg"
FFPROBE_BIN = "ffprobe"
PROBE_TIMEOUT_SEC = 5
CHUNK_SIZE = 16384

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def upstream_headers(source_url: str) -> dict[str, str]:
    """Headers that make browser-restricted HLS sources (e.g. SkylineWebcams) work."""
    host = (urlparse(source_url).hostname or "").lower()
    headers = {
        "User-Agent": BROWSER_UA,
        "Accept": "*/*",
    }
    if "skylinewebcams.com" in host:
        headers["Referer"] = "https://www.skylinewebcams.com/"
        headers["Origin"] = "https://www.skylinewebcams.com"
    else:
        parsed = urlparse(source_url)
        if parsed.scheme and parsed.netloc:
            origin = f"{parsed.scheme}://{parsed.netloc}"
            headers["Referer"] = f"{origin}/"
            headers["Origin"] = origin
    return headers


def parent_domain(hostname: str) -> str:
    parts = hostname.lower().split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return hostname.lower()


def is_allowed_hls_asset(camera_source_url: str, asset_url: str) -> bool:
    """Only proxy assets that share the same parent domain as the camera source."""
    try:
        source_host = urlparse(camera_source_url).hostname or ""
        asset_host = urlparse(asset_url).hostname or ""
        asset_scheme = urlparse(asset_url).scheme.lower()
    except Exception:
        return False
    if asset_scheme not in {"http", "https"} or not source_host or not asset_host:
        return False
    return parent_domain(source_host) == parent_domain(asset_host)


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


def _ffmpeg_headers_arg(source_url: str) -> list[str]:
    """Browser-like headers for HTTP(S)/HLS sources that block bare ffmpeg."""
    lower = source_url.lower()
    if not (lower.startswith("http://") or lower.startswith("https://")):
        return []
    headers = upstream_headers(source_url)
    # ffmpeg expects a single string with CRLF-separated header lines.
    header_lines = "".join(f"{k}: {v}\r\n" for k, v in headers.items())
    return ["-headers", header_lines]


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
    args.extend(_ffmpeg_headers_arg(source_url))
    args.extend(["-i", source_url])
    return args


async def test_stream_url(source_url: str) -> tuple[bool, str]:
    if not source_url.strip():
        return False, "URL источника не указан"

    # HLS streams play in the browser via hls.js — a lightweight HTTP check is enough.
    if is_hls_url(source_url):
        return await _test_hls_url(source_url)

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


async def _test_hls_url(source_url: str) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SEC, follow_redirects=True) as client:
            response = await client.get(source_url, headers=upstream_headers(source_url))
            response.raise_for_status()
            body = response.text.strip()
    except httpx.TimeoutException:
        return False, "Таймаут подключения к источнику"
    except httpx.HTTPError as exc:
        return False, f"Не удалось загрузить плейлист: {exc}"

    if not body.startswith("#EXTM3U"):
        return False, "Ответ не является HLS-плейлистом"

    if "#EXT-X-ENDLIST" in body and "#EXTINF:" not in body:
        return False, "HLS-токен истёк — скопируйте свежий live.m3u8?a=… со страницы камеры"

    if ".ts" not in body and ".m3u8" not in body.split("\n", 1)[-1]:
        return False, "Плейлист пуст — проверьте URL или обновите токен"

    return True, "HLS-плейлист доступен"


def rewrite_hls_playlist(
    playlist_text: str,
    playlist_url: str,
    proxy_asset_base: str,
    auth_token: str | None = None,
) -> str:
    """Rewrite media URIs in an HLS playlist so they go through our proxy."""
    lines: list[str] = []
    for raw_line in playlist_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            # URI="..." attributes in tags (EXT-X-KEY, EXT-X-MAP, etc.)
            if 'URI="' in line:
                start = line.index('URI="') + 5
                end = line.index('"', start)
                uri = line[start:end]
                absolute = urljoin(playlist_url, uri)
                proxied = _proxy_asset_url(proxy_asset_base, absolute, auth_token)
                line = line[:start] + proxied + line[end:]
            lines.append(line)
            continue

        absolute = urljoin(playlist_url, line)
        lines.append(_proxy_asset_url(proxy_asset_base, absolute, auth_token))
    return "\n".join(lines) + "\n"


def _proxy_asset_url(proxy_asset_base: str, absolute_url: str, auth_token: str | None) -> str:
    params = [f"url={quote(absolute_url, safe='')}"]
    if auth_token:
        params.append(f"token={quote(auth_token, safe='')}")
    sep = "&" if "?" in proxy_asset_base else "?"
    return f"{proxy_asset_base}{sep}{'&'.join(params)}"


async def fetch_hls_playlist(source_url: str) -> tuple[str, str]:
    """Fetch playlist text; returns (final_url_after_redirects, body)."""
    async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SEC, follow_redirects=True) as client:
        response = await client.get(source_url, headers=upstream_headers(source_url))
        response.raise_for_status()
        return str(response.url), response.text


async def proxy_hls_asset(asset_url: str, camera_source_url: str) -> AsyncIterator[bytes]:
    headers = upstream_headers(camera_source_url)
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, read=None), follow_redirects=True) as client:
        async with client.stream("GET", asset_url, headers=headers) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(CHUNK_SIZE):
                yield chunk


async def fetch_hls_asset_bytes(asset_url: str, camera_source_url: str) -> tuple[bytes, str]:
    headers = upstream_headers(camera_source_url)
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        response = await client.get(asset_url, headers=headers)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "application/octet-stream")
        return response.content, content_type


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
    headers = upstream_headers(source_url)
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=None), follow_redirects=True) as client:
        async with client.stream("GET", source_url, headers=headers) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(CHUNK_SIZE):
                yield chunk
