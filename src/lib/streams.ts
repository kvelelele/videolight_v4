import { getToken } from './api';
import type { Camera } from './mockData';

const UNSUPPORTED_TYPES: Camera['sourceType'][] = ['USB Camera', 'Web Camera'];

export function isStreamSupported(camera: Camera): boolean {
  return !UNSUPPORTED_TYPES.includes(camera.sourceType) && !!camera.sourceUrl.trim();
}

export function isHlsUrl(url: string): boolean {
  const path = url.toLowerCase().split('?')[0];
  return path.includes('.m3u8');
}

export function shouldUseDirectStream(camera: Camera): boolean {
  if (camera.sourceType !== 'HTTP' || !camera.sourceUrl.trim()) {
    return false;
  }
  // HLS and similar formats need backend FFmpeg transcode
  if (isHlsUrl(camera.sourceUrl)) {
    return false;
  }
  return true;
}

export function getProxiedStreamUrl(cameraId: string): string {
  const token = getToken();
  const params = new URLSearchParams();
  if (token) {
    params.set('token', token);
  }
  const query = params.toString();
  return `/api/cameras/${cameraId}/stream${query ? `?${query}` : ''}`;
}

export function isVideoFileUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(lower);
}
