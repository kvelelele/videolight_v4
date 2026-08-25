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

export function detectSourceType(url: string): Camera['sourceType'] {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return 'HTTP';
  if (trimmed.startsWith('rtsp://')) return 'RTSP';
  if (trimmed.startsWith('device://')) return 'USB Camera';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'HTTP';
  if (trimmed.includes('.m3u8')) return 'HTTP';
  return 'HTTP';
}

export function shouldUseDirectStream(camera: Camera): boolean {
  // HLS always goes through backend proxy (Referer / token handling).
  // Other HTTP streams (MJPEG etc.) can play directly when possible.
  if (isHlsUrl(camera.sourceUrl)) return false;
  return camera.sourceType === 'HTTP' && !!camera.sourceUrl.trim();
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
