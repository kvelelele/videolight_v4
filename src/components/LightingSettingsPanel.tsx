import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import {
  commandController,
  createController,
  deleteController,
  listControllers,
  testController,
  updateController,
  type ControllerStatus,
  type LightingController,
  type LightingControllerPayload,
} from '../lib/lighting';
import ControllerModal from './ControllerModal';

const TYPE_LABEL: Record<LightingController['type'], string> = {
  imperium: 'STAR Imperium-1',
  spectrum: 'STAR Spectrum-1',
};

function statusDot(status: ControllerStatus): string {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'offline':
      return 'bg-red-500';
    case 'error':
      return 'bg-red-600';
    default:
      return 'bg-gray-400';
  }
}

function statusLabel(status: ControllerStatus): string {
  switch (status) {
    case 'online':
      return 'Онлайн';
    case 'offline':
      return 'Офлайн';
    case 'error':
      return 'Ошибка';
    default:
      return 'Неизвестно';
  }
}

export default function LightingSettingsPanel() {
  const [controllers, setControllers] = useState<LightingController[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editController, setEditController] = useState<LightingController | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LightingController | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await listControllers();
      setControllers(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить контроллеры');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setActionError('');
    setActionNote('');
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = (controller: LightingController) =>
    withBusy(controller.id, async () => {
      const result = await testController(controller.id);
      setActionNote(result.message);
      await load();
    });

  const handleCommand = (controller: LightingController, action: 'on' | 'off') =>
    withBusy(controller.id, async () => {
      const updated = await commandController(controller.id, action);
      setControllers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    });

  const handleSave = async (payload: LightingControllerPayload) => {
    setActionError('');
    if (editController) {
      await updateController(editController.id, payload);
    } else {
      await createController(payload);
    }
    setShowAddModal(false);
    setEditController(null);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionError('');
    try {
      await deleteController(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось удалить контроллер');
    }
  };

  return (
    <div>
      {(error || actionError) && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError || error}
        </div>
      )}
      {actionNote && !actionError && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{actionNote}</div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Освещение</h3>
          <p className="max-w-2xl text-xs text-gray-500">
            Свет включается, когда на связанной камере есть человек или автомобиль, и выключается после задержки,
            если присутствие пропало. Это не датчик движения — учитывается именно присутствие в кадре.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {loading && controllers.length === 0
              ? 'Загрузка…'
              : `${controllers.length} ${declOfNum(controllers.length, ['контроллер', 'контроллера', 'контроллеров'])} в системе`}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Добавить контроллер
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[56rem] divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Название</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Тип</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">IP</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Статус</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Свет</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Камеры</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Задержка</th>
              <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {controllers.map((controller) => {
              const busy = busyId === controller.id;
              return (
                <tr key={controller.id} className="transition-colors hover:bg-gray-50/50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{controller.name}</p>
                    {controller.lastError && (
                      <p className="max-w-xs truncate text-xs text-red-400" title={controller.lastError}>
                        {controller.lastError}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {TYPE_LABEL[controller.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="block max-w-xs truncate font-mono text-xs text-gray-500" title={`${controller.host}:${controller.port}`}>
                      {controller.host}:{controller.port}
                    </code>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(controller.status)}`} />
                      <span className="text-xs font-medium text-gray-600">{statusLabel(controller.status)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-gray-600">
                    {controller.lightOn ? 'Вкл' : 'Выкл'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {controller.cameraIds.length}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {controller.offDelaySec} с
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void handleTest(controller)}
                        disabled={busy}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                      >
                        Проверить
                      </button>
                      <button
                        onClick={() => void handleCommand(controller, 'on')}
                        disabled={busy}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                      >
                        Вкл
                      </button>
                      <button
                        onClick={() => void handleCommand(controller, 'off')}
                        disabled={busy}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                      >
                        Выкл
                      </button>
                      <button
                        onClick={() => setEditController(controller)}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => setDeleteTarget(controller)}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && controllers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  Контроллеры ещё не добавлены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(showAddModal || editController) && (
        <ControllerModal
          editController={editController ?? undefined}
          onClose={() => {
            setShowAddModal(false);
            setEditController(null);
          }}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          controllerName={deleteTarget.name}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function declOfNum(n: number, titles: [string, string, string]): string {
  return titles[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
}

function DeleteConfirmModal({
  controllerName,
  onConfirm,
  onCancel,
}: {
  controllerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="px-5 py-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="mb-1 text-base font-semibold text-gray-900">Удалить контроллер?</h3>
          <p className="text-sm text-gray-500">
            Контроллер «{controllerName}» будет удалён, связанные камеры отвяжутся.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
