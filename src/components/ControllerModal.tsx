import { useState } from 'react';
import { ApiError } from '../lib/api';
import { useCameras } from '../lib/cameras';
import type { ControllerType, LightingController, LightingControllerPayload } from '../lib/lighting';

export default function ControllerModal({
  onClose,
  onSave,
  editController,
}: {
  onClose: () => void;
  onSave: (payload: LightingControllerPayload) => Promise<void>;
  editController?: LightingController;
}) {
  const isEdit = !!editController;
  const { cameras } = useCameras();

  const [name, setName] = useState(editController?.name ?? '');
  const [type, setType] = useState<ControllerType>(editController?.type ?? 'imperium');
  const [host, setHost] = useState(editController?.host ?? '');
  const [port, setPort] = useState(String(editController?.port ?? 90));
  const [username, setUsername] = useState(editController?.username ?? 'TRION');
  const [password, setPassword] = useState('');
  const [offDelaySec, setOffDelaySec] = useState(String(editController?.offDelaySec ?? 60));
  const [cameraIds, setCameraIds] = useState<string[]>(editController?.cameraIds ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const toggleCamera = (id: string) => {
    setCameraIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Укажите название контроллера');
      return;
    }
    if (!host.trim()) {
      setSaveError('Укажите адрес контроллера');
      return;
    }

    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setSaveError('Укажите корректный порт (1–65535)');
      return;
    }

    const parsedDelay = Number(offDelaySec);
    if (!Number.isInteger(parsedDelay) || parsedDelay < 1 || parsedDelay > 3600) {
      setSaveError('Задержка выключения — от 1 до 3600 секунд');
      return;
    }

    const payload: LightingControllerPayload = {
      name: name.trim(),
      type,
      host: host.trim(),
      port: parsedPort,
      username: username.trim() || 'TRION',
      offDelaySec: parsedDelay,
      enabled: editController?.enabled ?? true,
      cameraIds,
    };
    if (password) {
      payload.password = password;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onSave(payload);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Не удалось сохранить контроллер');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Редактирование контроллера' : 'Добавить контроллер'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Офис — освещение"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Тип</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('imperium')}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                  type === 'imperium'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                STAR Imperium-1
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-400"
              >
                STAR Spectrum-1
                <span className="mt-0.5 block text-xs font-normal">скоро</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Адрес (IP)</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.50"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Порт</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="90"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Логин</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="TRION"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? 'Оставьте пустым, чтобы не менять' : 'TRION1'}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Задержка выключения, сек</label>
            <input
              type="number"
              value={offDelaySec}
              onChange={(e) => setOffDelaySec(e.target.value)}
              placeholder="60"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="mt-1 text-xs text-gray-400">
              Свет погаснет через это время после того, как на всех связанных камерах не останется человека или автомобиля.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Камеры</label>
            {cameras.length === 0 ? (
              <p className="text-xs text-gray-400">Камеры ещё не добавлены. Сначала добавьте камеру во вкладке «Камеры».</p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-gray-200 px-3 py-2">
                {cameras.map((camera) => (
                  <label key={camera.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={cameraIds.includes(camera.id)}
                      onChange={() => toggleCamera(camera.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium">{camera.name}</span>
                    {camera.location && <span className="text-xs text-gray-400">{camera.location}</span>}
                  </label>
                ))}
              </div>
            )}
            {cameraIds.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Автоматика не заработает, пока не выбрана хотя бы одна камера. Свет можно включать вручную.
              </p>
            )}
          </div>

          {saveError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
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
            {saving ? 'Сохранение…' : isEdit ? 'Сохранить изменения' : 'Сохранить контроллер'}
          </button>
        </div>
      </div>
    </div>
  );
}
