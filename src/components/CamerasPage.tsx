import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useCameras } from '../lib/cameras';
import { getStatusBg, getStatusLabel, type Camera, type CameraPayload } from '../lib/mockData';
import { ApiError } from '../lib/api';

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
                  {camera.status === 'online' && (
                    <span className="text-xs font-medium text-gray-500">
                      {camera.detectionObjects.length} {declOfNum(camera.detectionObjects.length, ['объект', 'объекта', 'объектов'])}
                    </span>
                  )}
                  {camera.status !== 'online' && (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function declOfNum(n: number, titles: [string, string, string]): string {
  return titles[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
}

/* ─── Video Stream ─── */
function VideoStream({ camera, isAdmin }: { camera: Camera; isAdmin: boolean }) {
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Simulate connecting state transition
  const [simulatedStatus, setSimulatedStatus] = useState(camera.status);
  useEffect(() => {
    if (camera.status === 'connecting') {
      const timer = setTimeout(() => setSimulatedStatus('online'), 3000);
      return () => clearTimeout(timer);
    } else {
      setSimulatedStatus(camera.status);
    }
  }, [camera.status, retryCount]);

  const handleRetry = () => {
    setSimulatedStatus('connecting');
    setRetryCount((c) => c + 1);
  };

  const status = simulatedStatus;

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`rounded-lg border p-1.5 transition-colors ${
                showAnalytics
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                  : 'border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
              title="Настройки отображения аналитики"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>
            <button
              className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              title="Полноэкранный режим"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Video player */}
        <div className="flex-1 flex items-center justify-center bg-gray-950 p-4">
          {status === 'connecting' && <ConnectingState />}
          {status === 'offline' && <OfflineState onRetry={handleRetry} />}
          {status === 'error' && <OfflineState onRetry={handleRetry} />}
          {status === 'online' && (
            <div className="relative w-full h-full max-h-full flex items-center justify-center">
              <VideoFrame camera={camera} />
            </div>
          )}
        </div>
      </div>

      {/* Analytics panel */}
      {showAnalytics && status === 'online' && (
        <AnalyticsPanel camera={camera} />
      )}
    </div>
  );
}

/* ─── Connecting State ─── */
function ConnectingState() {
  return (
    <div className="text-center">
      <svg className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm font-medium text-gray-300">Подключение к видеопотоку…</p>
      <p className="mt-1 text-xs text-gray-500">Установка соединения с камерой</p>
    </div>
  );
}

/* ─── Offline State ─── */
function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30">
        <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-300">Видеопоток недоступен</p>
      <p className="mt-1 text-xs text-gray-500">Проверьте подключение камеры</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
      >
        Повторить подключение
      </button>
    </div>
  );
}

/* ─── Video Frame with Detection Overlay ─── */
function VideoFrame({ camera }: { camera: Camera }) {
  const isParking = camera.sceneType === 'parking';
  const objects = camera.detectionObjects;

  // Animate objects slightly to simulate tracking
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 60);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Calculate animated positions
  const animatedObjects = objects.map((obj, i) => {
    const drift = Math.sin((frame + i * 20) * 0.1) * 8;
    return {
      ...obj,
      x: obj.x + drift,
      y: obj.y + Math.cos((frame + i * 15) * 0.08) * 4,
    };
  });

  return (
    <div className="relative overflow-hidden rounded-lg bg-gray-800" style={{ maxWidth: '100%', maxHeight: '100%' }}>
      {/* Scene image */}
      <img
        src={isParking
          ? 'https://s3.twcstorage.ru/lovarus/vibebuilder/projects/17c2c24b-26ea-4cbe-9226-4a5c1a0279d9/images/dd2057c2-3233-4017-8159-83eba9f703f0.jpg'
          : 'https://s3.twcstorage.ru/lovarus/vibebuilder/projects/17c2c24b-26ea-4cbe-9226-4a5c1a0279d9/images/43b15356-6685-4259-bf00-dc591c991b5f.jpg'
        }
        alt={isParking ? 'Парковка' : 'Офис'}
        className="block w-full h-auto max-h-[calc(100vh-16rem)] object-contain"
        style={{ aspectRatio: '16/9' }}
      />

      {/* Detection overlays */}
      {animatedObjects.map((obj) => (
        <div
          key={obj.id}
          className="absolute pointer-events-none"
          style={{
            left: `${(obj.x / 1920) * 100}%`,
            top: `${(obj.y / 1080) * 100}%`,
            width: `${(obj.width / 1920) * 100}%`,
            height: `${(obj.height / 1080) * 100}%`,
          }}
        >
          {/* Bounding box */}
          <div
            className={`absolute inset-0 border-2 rounded-sm ${
              obj.type === 'person'
                ? 'border-emerald-400'
                : 'border-amber-400'
            }`}
          >
            {/* Animated tracking indicator */}
            <div
              className={`absolute -inset-0.5 rounded-sm opacity-20 animate-pulse ${
                obj.type === 'person' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>

          {/* Label */}
          <div
            className={`absolute -top-6 left-0 flex items-center gap-1.5 rounded-t px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap ${
              obj.type === 'person' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          >
            <span>{obj.label}</span>
          </div>

          {/* Coordinates */}
          <div
            className={`absolute -bottom-5 left-0 rounded-b px-1.5 py-0.5 text-[9px] font-mono text-white/80 whitespace-nowrap ${
              obj.type === 'person' ? 'bg-emerald-500/70' : 'bg-amber-500/70'
            }`}
          >
            x: {Math.round(obj.x)} y: {Math.round(obj.y)}
          </div>
        </div>
      ))}

      {/* Camera info overlay */}
      <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1">
        <span className="text-[10px] text-gray-300">{camera.name} · {camera.resolution}</span>
      </div>
    </div>
  );
}

/* ─── Analytics Panel ─── */
function AnalyticsPanel({ camera }: { camera: Camera }) {
  const people = camera.detectionObjects.filter((o) => o.type === 'person');
  const cars = camera.detectionObjects.filter((o) => o.type === 'car');

  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Видеоаналитика</h3>

        {/* Stats */}
        <div className="space-y-2 mb-4">
          <StatRow label="Объекты в кадре" value={String(camera.detectionObjects.length)} />
          <StatRow label="Люди" value={String(people.length)} />
          <StatRow label="Автомобили" value={String(cars.length)} />
          <div className="border-t border-gray-100 pt-2 mt-2">
            <StatRow label="Статус аналитики" value="Активна" valueColor="text-green-600" />
            <StatRow label="Модель" value="Object Detection" />
            <StatRow label="Tracking" value="Активен" valueColor="text-green-600" />
          </div>
        </div>

        {/* Objects list */}
        <div className="border-t border-gray-100 pt-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Обнаруженные объекты</h4>
          <div className="space-y-2">
            {camera.detectionObjects.map((obj) => (
              <div
                key={obj.id}
                className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${obj.type === 'person' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-sm font-medium text-gray-900">
                    {obj.type === 'person' ? 'Человек' : 'Автомобиль'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono">
                  x {Math.round(obj.x)} · y {Math.round(obj.y)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-semibold ${valueColor ?? 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

/* ─── Camera Modal (Add/Edit) ─── */
function CameraModal({
  onClose,
  onSave,
  editCamera,
}: {
  onClose: () => void;
  onSave: (camera: CameraPayload) => Promise<void>;
  editCamera?: Camera;
}) {
  const isEdit = !!editCamera;
  const [name, setName] = useState(editCamera?.name ?? '');
  const [location, setLocation] = useState(editCamera?.location ?? '');
  const [sourceType, setSourceType] = useState(editCamera?.sourceType ?? 'RTSP');
  const [sourceUrl, setSourceUrl] = useState(editCamera?.sourceUrl ?? '');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('554');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceIndex, setDeviceIndex] = useState('0');
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const showUrlField = sourceType === 'RTSP' || sourceType === 'HTTP';
  const showHostFields = sourceType === 'IP Camera';
  const showDeviceField = sourceType === 'USB Camera' || sourceType === 'Web Camera';

  const handleTestConnection = () => {
    setTestResult('testing');
    setTimeout(() => {
      setTestResult(Math.random() > 0.3 ? 'success' : 'fail');
    }, 1500);
  };

  const resolveSourceUrl = () => {
    if (showUrlField) return sourceUrl;
    if (showHostFields) return `${host}:${port}`;
    return `device://${deviceIndex}`;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Укажите название камеры');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        id: editCamera?.id ?? `cam-${Date.now()}`,
        name: name.trim(),
        location: location.trim(),
        sourceType,
        sourceUrl: resolveSourceUrl(),
        status: editCamera?.status ?? 'online',
        lastConnected: editCamera?.lastConnected ?? new Date().toLocaleString('ru-RU'),
        resolution: editCamera?.resolution ?? '1920 × 1080',
        fps: editCamera?.fps ?? 25,
        sceneType: editCamera?.sceneType ?? 'office',
      });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Не удалось сохранить камеру');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Редактирование камеры' : 'Добавить камеру'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название камеры</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Офис — вход"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Расположение</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Например, Главный вход, 1 этаж"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          {/* Source type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тип источника</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as Camera['sourceType'])}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              <option value="RTSP">RTSP</option>
              <option value="IP Camera">IP Camera</option>
              <option value="HTTP">HTTP</option>
              <option value="USB Camera">USB Camera</option>
              <option value="Web Camera">Web Camera</option>
            </select>
          </div>

          {/* Dynamic connection params */}
          {showUrlField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {sourceType === 'RTSP' ? 'RTSP URL' : 'HTTP Stream URL'}
              </label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={sourceType === 'RTSP' ? 'rtsp://192.168.1.100:554/stream1' : 'http://192.168.1.100:8080/video'}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          )}

          {showHostFields && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.100"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="554"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          {showDeviceField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {sourceType === 'USB Camera' ? 'Camera Index' : 'Browser Camera'}
              </label>
              <input
                type="text"
                value={deviceIndex}
                onChange={(e) => setDeviceIndex(e.target.value)}
                placeholder="0"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          )}

          {/* Test connection result */}
          {testResult === 'testing' && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Проверка подключения…
            </div>
          )}
          {testResult === 'success' && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Подключение успешно
            </div>
          )}
          {testResult === 'fail' && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Ошибка подключения
            </div>
          )}
          {saveError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <button
            onClick={handleTestConnection}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Проверить подключение
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving ? 'Сохранение…' : isEdit ? 'Сохранить изменения' : 'Сохранить камеру'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}