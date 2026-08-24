import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { CamerasProvider } from './lib/cameras';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import CamerasPage from './components/CamerasPage';
import SettingsPage from './components/SettingsPage';

function AppContent() {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState<'cameras' | 'settings'>('cameras');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <CamerasProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {activePage === 'cameras' && <CamerasPage />}
          {activePage === 'settings' && <SettingsPage />}
        </main>
      </div>
    </CamerasProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
