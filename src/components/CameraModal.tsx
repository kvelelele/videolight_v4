import { useState } from 'react';
import { ApiError } from '../lib/api';
import {
  defaultIpFields,
  parseIpCameraUrl,
  resolveSourceUrl,
  testCameraConnection,
  type IpCameraFields,
} from '../lib/cameraForm';
import type { Camera, CameraPayload } from '../lib/mockData';

export default function CameraModal({
  onClose,
  onSave,
  editCamera,
}: {
  onClose: () => void;
  onSave: (camera: CameraPayload) => Promise<void>;
  editCamera?: Camera;
}) {
  const isEdit = !!editCamera;
  const parsedIp = editCamera?.sourceType === 'IP Camera' ? parseIpCameraUrl(editCamera.sourceUrl) : {};

  const [name, setName] = useState(editCamera?.name ?? '');
  const [location, setLocation] = useState(editCamera?.location ?? '');
  const [sourceType, setSourceType] = useState<Camera['sourceType']>(editCamera?.sourceType ?? 'RTSP');
  const [sourceUrl, setSourceUrl] = useState(
    editCamera && (editCamera.sourceType === 'RTSP' || editCamera.sourceType === 'HTTP')
      ? editCamera.sourceUrl
      : ''
  );
  const [ipFields, setIpFields] = useState<IpCameraFields>({
    ...defaultIpFields(),
    ...parsedIp,
  });
  const [deviceIndex, setDeviceIndex] = useState(
    editCamera?.sourceType === 'USB Camera' || editCamera?.sourceType === 'Web Camera'
      ? editCamera.sourceUrl.replace('device://', '') || '0'
      : '0'
  );
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const showUrlField = sourceType === 'RTSP' || sourceType === 'HTTP';
  const showHostFields = sourceType === 'IP Camera';
  const showDeviceField = sourceType === 'USB Camera' || sourceType === 'Web Camera';

  const handleTestConnection = async () => {
    const resolvedUrl = resolveSourceUrl(sourceType, sourceUrl, ipFields, deviceIndex);
    if (!resolvedUrl) {
      setTestResult('fail');
      setTestMessage('Заполните параметры подключения');
      return;
    }

    setTestResult('testing');
    setTestMessage('');
    try {
      const result = await testCameraConnection(sourceType, resolvedUrl);
      setTestResult(result.success ? 'success' : 'fail');
      setTestMessage(result.message);
    } catch (err) {
      setTestResult('fail');
      setTestMessage(err instanceof ApiError ? err.message : 'Ошибка проверки подключения');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Укажите название камеры');
      return;
    }

    const resolvedUrl = resolveSourceUrl(sourceType, sourceUrl, ipFields, deviceIndex);
    if (!resolvedUrl && !showDeviceField) {
      setSaveError('Укажите параметры подключения');
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
        sourceUrl: resolvedUrl,
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

  const updateIpField = (key: keyof IpCameraFields, value: string) => {
    setIpFields((prev) => ({ ...prev, [key]: value }));
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

          {showUrlField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {sourceType === 'RTSP' ? 'RTSP URL' : 'HTTP Stream URL'}
              </label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={sourceType === 'RTSP' ? 'rtsp://192.168.1.100:554/stream1' : 'http://host/video или https://host/live.m3u8'}
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
                    value={ipFields.host}
                    onChange={(e) => updateIpField('host', e.target.value)}
                    placeholder="192.168.1.100"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input
                    type="text"
                    value={ipFields.port}
                    onChange={(e) => updateIpField('port', e.target.value)}
                    placeholder="554"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stream path</label>
                <input
                  type="text"
                  value={ipFields.path}
                  onChange={(e) => updateIpField('path', e.target.value)}
                  placeholder="/stream1"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={ipFields.username}
                    onChange={(e) => updateIpField('username', e.target.value)}
                    placeholder="admin"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={ipFields.password}
                    onChange={(e) => updateIpField('password', e.target.value)}
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
              <p className="mt-1 text-xs text-gray-400">Воспроизведение USB/Web камер будет добавлено позже</p>
            </div>
          )}

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
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Подключение успешно
              </div>
              {testMessage && <p className="mt-1 text-xs text-green-600">{testMessage}</p>}
            </div>
          )}
          {testResult === 'fail' && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Ошибка подключения
              </div>
              {testMessage && <p className="mt-1 text-xs text-red-500">{testMessage}</p>}
            </div>
          )}
          {saveError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <button
            onClick={() => void handleTestConnection()}
            disabled={showDeviceField}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
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
