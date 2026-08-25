import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useCameras } from '../lib/cameras';
import { getStatusBg, getStatusLabel, type Camera } from '../lib/mockData';
import CameraModal from './CameraModal';
import CameraStreamPlayer, { type StreamState } from './CameraStreamPlayer';

export default function CamerasPage() {
  const { isAdmin } = useAuth();
  const { cameras, loading, error, refresh, addCamera } = useCameras();
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) ?? null;

  // Auto-select first online camera
  useEffect(() => {
    if (!selectedCameraId && cameras.length > 0) {
      const firstOnline = cameras.find((c) => c.status === 'online');
      setSelectedCameraId(firstOnline?.id ?? cameras[0].id);
    }
    if (selectedCameraId && !cameras.some((c) => c.id === selectedCameraId)) {
      setSelectedCameraId(cameras[0]?.id ?? null);
    }
  }, [cameras, selectedCameraId]);

  const handleRefresh = useCallback(() => {
    void refresh().then(() => setRefreshKey((k) => k + 1));
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Камеры</h2>
          <p className="text-sm text-gray-500">Просмотр видеопотоков и результатов видеоаналитики</p>
        </div>
        <div className="flex items-center gap-4">
          {/* System status */}
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-700">System Online</span>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            title="Обновить"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>

          {/* Add camera button (admin only) */}
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Добавить камеру
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {loading && cameras.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Загрузка камер…</div>
        ) : error && cameras.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => void refresh()}
                className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Повторить
              </button>
            </div>
          </div>
        ) : cameras.length === 0 ? (
          <EmptyState isAdmin={isAdmin} onAdd={() => setShowAddModal(true)} />
        ) : (
          <>
            {/* Camera list sidebar */}
            <CameraList
              cameras={cameras}
              selectedId={selectedCameraId}
              onSelect={setSelectedCameraId}
            />

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {selectedCamera ? (
                <VideoStream
                  key={`${selectedCamera.id}-${refreshKey}`}
                  camera={selectedCamera}
                  isAdmin={isAdmin}
                />
              ) : (
                <NoCameraSelected />
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Camera Modal */}
      {showAddModal && (
        <CameraModal
          onClose={() => setShowAddModal(false)}
          onSave={async (payload) => {
            await addCamera(payload);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
          <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Камеры не подключены</h3>
        <p className="mt-1 text-sm text-gray-500">
          Добавьте первую камеру, чтобы начать просмотр видеопотока и видеоаналитику.
        </p>
        {isAdmin ? (
          <button
            onClick={onAdd}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Добавить камеру
          </button>
        ) : (
          <p className="mt-3 text-sm text-gray-400">
            Обратитесь к администратору для подключения камеры.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── No Camera Selected ─── */
function NoCameraSelected() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Выберите камеру</h3>
        <p className="mt-1 text-sm text-gray-500">
          Выберите камеру из списка слева для просмотра видеопотока.
        </p>
      </div>
    </div>
  );
}

/* ─── Camera List ─── */
function CameraList({
  cameras,
  selectedId,
  onSelect,
}: {
  cameras: Camera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-72 flex-shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50/50">
      <div className="p-3 space-y-2">
        {cameras.map((camera) => {
          const isSelected = camera.id === selectedId;
          return (
            <button
              key={camera.id}
              onClick={() => onSelect(camera.id)}
              className={`w-full rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? 'border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              {/* Preview thumbnail */}
              <div className="relative mb-2 overflow-hidden rounded-lg bg-gray-900 aspect-video">
                <div className="absolute inset-0 flex items-center justify-center">
                  {camera.status === 'online' ? (
                    <span className="text-[10px] font-medium text-gray-400">VIDEO</span>
                  ) : camera.status === 'connecting' ? (
                    <svg className="h-5 w-5 animate-spin text-yellow-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  )}
                </div>
                {/* Status dot overlay */}
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusBg(camera.status)}`} />
                  <span className="text-[10px] font-medium text-white">{getStatusLabel(camera.status)}</span>
                </div>
              </div>

              {/* Camera info */}
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-gray-900 truncate">{camera.name}</h4>
                <p className="text-xs text-gray-400 truncate">{camera.location}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-gray-400 uppercase">{camera.sourceType}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Video Stream ─── */
function VideoStream({ camera }: { camera: Camera; isAdmin: boolean }) {
  const [streamState, setStreamState] = useState<StreamState>('loading');

  const status =
    streamState === 'playing'
      ? 'online'
      : streamState === 'error'
        ? 'error'
        : camera.status === 'offline'
          ? 'offline'
          : 'connecting';

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Video area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Video info bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">{camera.name}</h3>
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${getStatusBg(status)}`} />
              <span className="text-xs font-medium text-gray-500">{getStatusLabel(status)}</span>
            </div>
            {status === 'online' && (
              <span className="text-xs text-gray-400">{camera.resolution} · {camera.fps} FPS</span>
            )}
          </div>
        </div>

        {/* Video player */}
        <div className="flex-1 flex items-center justify-center bg-gray-950 p-4">
          <div className="relative w-full h-full max-h-full flex items-center justify-center">
            <CameraStreamPlayer camera={camera} onStateChange={setStreamState} />
          </div>
        </div>
      </div>
    </div>
  );
}