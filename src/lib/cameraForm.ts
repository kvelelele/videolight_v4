import { api } from './api';
import type { Camera } from './mockData';

export interface CameraTestResult {
  success: boolean;
  message: string;
}

export async function testCameraConnection(
  sourceType: Camera['sourceType'],
  sourceUrl: string
): Promise<CameraTestResult> {
  return api<CameraTestResult>('/api/cameras/test', {
    method: 'POST',
    body: { sourceType, sourceUrl },
  });
}

export interface IpCameraFields {
  host: string;
  port: string;
  username: string;
  password: string;
  path: string;
}

export function buildIpCameraUrl(fields: IpCameraFields): string {
  const host = fields.host.trim();
  const port = fields.port.trim() || '554';
  const path = fields.path.trim() || '/stream1';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!host) return '';

  const auth =
    fields.username.trim() !== ''
      ? `${encodeURIComponent(fields.username)}:${encodeURIComponent(fields.password)}@`
      : '';

  return `rtsp://${auth}${host}:${port}${normalizedPath}`;
}

export function parseIpCameraUrl(sourceUrl: string): Partial<IpCameraFields> {
  try {
    const url = new URL(sourceUrl);
    return {
      host: url.hostname,
      port: url.port || '554',
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      path: url.pathname || '/stream1',
    };
  } catch {
    return {};
  }
}

export function resolveSourceUrl(
  sourceType: Camera['sourceType'],
  sourceUrl: string,
  ipFields: IpCameraFields,
  deviceIndex: string
): string {
  if (sourceType === 'RTSP' || sourceType === 'HTTP') {
    return sourceUrl.trim();
  }
  if (sourceType === 'IP Camera') {
    return buildIpCameraUrl(ipFields);
  }
  return `device://${deviceIndex.trim() || '0'}`;
}

export const defaultIpFields = (): IpCameraFields => ({
  host: '',
  port: '554',
  username: '',
  password: '',
  path: '/stream1',
});
