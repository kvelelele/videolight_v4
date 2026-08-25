export interface Camera {
  id: string;
  name: string;
  location: string;
  sourceType: 'RTSP' | 'IP Camera' | 'HTTP' | 'USB Camera' | 'Web Camera';
  sourceUrl: string;
  status: 'online' | 'connecting' | 'offline' | 'error';
  lastConnected: string | null;
  resolution: string;
  fps: number;
  sceneType: 'office' | 'parking';
}

export type CameraPayload = Camera;

export function getStatusColor(status: Camera['status']): string {
  switch (status) {
    case 'online':
      return 'text-green-600';
    case 'connecting':
      return 'text-yellow-500';
    case 'offline':
      return 'text-red-500';
    case 'error':
      return 'text-red-600';
  }
}

export function getStatusBg(status: Camera['status']): string {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'connecting':
      return 'bg-yellow-400';
    case 'offline':
      return 'bg-red-500';
    case 'error':
      return 'bg-red-600';
  }
}

export function getStatusLabel(status: Camera['status']): string {
  switch (status) {
    case 'online':
      return 'Онлайн';
    case 'connecting':
      return 'Подключение…';
    case 'offline':
      return 'Офлайн';
    case 'error':
      return 'Ошибка';
  }
}
