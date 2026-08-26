import { api } from './api';

export type ControllerType = 'imperium' | 'spectrum';
export type ControllerStatus = 'unknown' | 'online' | 'offline' | 'error';

export interface LightingController {
  id: string;
  name: string;
  type: ControllerType;
  host: string;
  port: number;
  username: string;
  passwordSet: boolean;
  offDelaySec: number;
  enabled: boolean;
  status: ControllerStatus;
  lastError: string | null;
  cameraIds: string[];
  lightOn: boolean;
}

export interface LightingControllerPayload {
  name: string;
  type: ControllerType;
  host: string;
  port: number;
  username: string;
  password?: string;
  offDelaySec: number;
  enabled: boolean;
  cameraIds: string[];
}

export function listControllers() {
  return api<LightingController[]>('/api/lighting/controllers');
}

export function createController(body: LightingControllerPayload) {
  return api<LightingController>('/api/lighting/controllers', { method: 'POST', body });
}

export function updateController(id: string, body: Partial<LightingControllerPayload>) {
  return api<LightingController>(`/api/lighting/controllers/${id}`, { method: 'PATCH', body });
}

export function deleteController(id: string) {
  return api<void>(`/api/lighting/controllers/${id}`, { method: 'DELETE' });
}

export function setControllerCameras(id: string, cameraIds: string[]) {
  return api<LightingController>(`/api/lighting/controllers/${id}/cameras`, {
    method: 'PUT',
    body: { cameraIds },
  });
}

export function testController(id: string) {
  return api<{ success: boolean; message: string; status: ControllerStatus }>(
    `/api/lighting/controllers/${id}/test`,
    { method: 'POST' },
  );
}

export function commandController(id: string, action: 'on' | 'off') {
  return api<LightingController>(`/api/lighting/controllers/${id}/command`, {
    method: 'POST',
    body: { action },
  });
}

export function postPresence(body: {
  cameraId: string;
  present: boolean;
  classes?: string[];
  ts?: number;
}) {
  return api<void>('/api/lighting/presence', { method: 'POST', body });
}
