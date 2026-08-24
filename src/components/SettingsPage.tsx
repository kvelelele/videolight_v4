import { useState } from 'react';
import { useCameras } from '../lib/cameras';
import { getStatusBg, getStatusLabel, type Camera } from '../lib/mockData';
import { ApiError } from '../lib/api';
import CameraModal from './CameraModal';

export default function SettingsPage() {
  const { cameras, loading, error, addCamera, updateCamera, deleteCamera: removeCamera } = useCameras();
  const [editCamera, setEditCamera] = useState<Camera | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionError, setActionError] = useState('');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionError('');
    try {
      await removeCamera(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось удалить камеру');
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Настройки</h2>
          <p className="text-sm text-gray-500">Управление камерами и подключениями</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Добавить камеру
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {(error || actionError) && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {actionError || error}
          </div>
        )}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Камеры</h3>
          <p className="text-xs text-gray-500">
            {loading && cameras.length === 0
              ? 'Загрузка…'
              : `${cameras.length} ${declOfNum(cameras.length, ['камера', 'камеры', 'камер'])} в системе`}
          </p>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Название</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Источник</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Статус</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Последнее подключение</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {cameras.map((camera) => (
                <tr key={camera.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{camera.name}</p>
                      <p className="text-xs text-gray-400">{camera.location}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-gray-500 font-mono">{camera.sourceUrl}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {camera.sourceType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${getStatusBg(camera.status)}`} />
                      <span className="text-xs font-medium text-gray-600">{getStatusLabel(camera.status)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{camera.lastConnected}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditCamera(camera)}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        Редактировать
                      </button>
                      <button
                        onClick={() => setDeleteTarget(camera)}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editCamera) && (
        <CameraModal
          editCamera={editCamera ?? undefined}
          onClose={() => { setShowAddModal(false); setEditCamera(null); }}
          onSave={async (payload) => {
            setActionError('');
            try {
              if (editCamera) {
                await updateCamera(editCamera.id, payload);
              } else {
                await addCamera(payload);
              }
              setShowAddModal(false);
              setEditCamera(null);
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : 'Не удалось сохранить камеру');
              throw err;
            }
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          cameraName={deleteTarget.name}
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

/* ─── Delete Confirmation Modal ─── */
function DeleteConfirmModal({
  cameraName,
  onConfirm,
  onCancel,
}: {
  cameraName: string;
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
          <h3 className="text-base font-semibold text-gray-900 mb-1">Удалить камеру?</h3>
          <p className="text-sm text-gray-500">
            Камера «{cameraName}» будет удалена из системы, а её подключение будет прекращено.
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