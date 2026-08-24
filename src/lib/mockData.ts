export interface DetectedObject {
  id: string;
  type: 'person' | 'car';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

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
  detectionObjects: DetectedObject[];
  sceneType: 'office' | 'parking';
}

/** Payload for create/update (without client-only detections). */
export type CameraPayload = Omit<Camera, 'detectionObjects'>;

const OFFICE_DETECTIONS: DetectedObject[] = [
  { id: 'obj-1', type: 'person', x: 842, y: 312, width: 48, height: 120, label: 'PERSON' },
  { id: 'obj-2', type: 'person', x: 1240, y: 410, width: 42, height: 115, label: 'PERSON' },
];

const PARKING_DETECTIONS: DetectedObject[] = [
  { id: 'obj-7', type: 'car', x: 1280, y: 540, width: 120, height: 70, label: 'CAR' },
  { id: 'obj-8', type: 'car', x: 400, y: 600, width: 110, height: 65, label: 'CAR' },
  { id: 'obj-9', type: 'car', x: 1600, y: 520, width: 115, height: 68, label: 'CAR' },
];

export function mockDetectionsForScene(sceneType: Camera['sceneType']): DetectedObject[] {
  if (sceneType === 'parking') {
    return PARKING_DETECTIONS.map((o) => ({ ...o }));
  }
  return OFFICE_DETECTIONS.map((o) => ({ ...o }));
}

export function withMockDetections(camera: Omit<Camera, 'detectionObjects'>): Camera {
  return {
    ...camera,
    lastConnected: camera.lastConnected ?? '',
    detectionObjects:
      camera.status === 'online' ? mockDetectionsForScene(camera.sceneType) : [],
  };
}

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
