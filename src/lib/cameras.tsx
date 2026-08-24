import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from './api';
import { withMockDetections, type Camera, type CameraPayload } from './mockData';
import { useAuth } from './auth';

interface CamerasContextType {
  cameras: Camera[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addCamera: (camera: CameraPayload) => Promise<Camera>;
  updateCamera: (id: string, camera: Partial<CameraPayload>) => Promise<Camera>;
  deleteCamera: (id: string) => Promise<void>;
}

const CamerasContext = createContext<CamerasContextType | null>(null);

type ApiCamera = Omit<Camera, 'detectionObjects'>;

function mapCamera(raw: ApiCamera): Camera {
  return withMockDetections(raw);
}

export function CamerasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCameras([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api<ApiCamera[]>('/api/cameras');
      setCameras(list.map(mapCamera));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить камеры');
      setCameras([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addCamera = useCallback(async (camera: CameraPayload): Promise<Camera> => {
    const created = await api<ApiCamera>('/api/cameras', {
      method: 'POST',
      body: {
        id: camera.id,
        name: camera.name,
        location: camera.location,
        sourceType: camera.sourceType,
        sourceUrl: camera.sourceUrl,
        status: camera.status,
        lastConnected: camera.lastConnected,
        resolution: camera.resolution,
        fps: camera.fps,
        sceneType: camera.sceneType,
      },
    });
    const mapped = mapCamera(created);
    setCameras((prev) => [...prev, mapped]);
    return mapped;
  }, []);

  const updateCamera = useCallback(
    async (id: string, camera: Partial<CameraPayload>): Promise<Camera> => {
      const updated = await api<ApiCamera>(`/api/cameras/${id}`, {
        method: 'PUT',
        body: {
          name: camera.name,
          location: camera.location,
          sourceType: camera.sourceType,
          sourceUrl: camera.sourceUrl,
          status: camera.status,
          lastConnected: camera.lastConnected,
          resolution: camera.resolution,
          fps: camera.fps,
          sceneType: camera.sceneType,
        },
      });
      const mapped = mapCamera(updated);
      setCameras((prev) => prev.map((c) => (c.id === id ? mapped : c)));
      return mapped;
    },
    []
  );

  const deleteCamera = useCallback(async (id: string): Promise<void> => {
    await api<void>(`/api/cameras/${id}`, { method: 'DELETE' });
    setCameras((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <CamerasContext.Provider
      value={{ cameras, loading, error, refresh, addCamera, updateCamera, deleteCamera }}
    >
      {children}
    </CamerasContext.Provider>
  );
}

export function useCameras(): CamerasContextType {
  const ctx = useContext(CamerasContext);
  if (!ctx) throw new Error('useCameras must be used within CamerasProvider');
  return ctx;
}
