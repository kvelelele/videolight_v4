import { useEffect, useMemo, useState } from 'react';
import type { Camera } from '../lib/mockData';
import {
  getProxiedStreamUrl,
  isStreamSupported,
  isVideoFileUrl,
  shouldUseDirectStream,
} from '../lib/streams';

type StreamState = 'loading' | 'playing' | 'error';

interface CameraStreamPlayerProps {
  camera: Camera;
  onStateChange?: (state: StreamState) => void;
}

function DetectionOverlay({ camera }: { camera: Camera }) {
  const objects = camera.detectionObjects;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (objects.length === 0) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 60);
    }, 100);
    return () => clearInterval(interval);
  }, [objects.length]);

  const animatedObjects = objects.map((obj, i) => {
    const drift = Math.sin((frame + i * 20) * 0.1) * 8;
    return {
      ...obj,
      x: obj.x + drift,
      y: obj.y + Math.cos((frame + i * 15) * 0.08) * 4,
    };
  });

  return (
    <>
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
          <div
            className={`absolute inset-0 border-2 rounded-sm ${
              obj.type === 'person' ? 'border-emerald-400' : 'border-amber-400'
            }`}
          >
            <div
              className={`absolute -inset-0.5 rounded-sm opacity-20 animate-pulse ${
                obj.type === 'person' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>
          <div
            className={`absolute -top-6 left-0 flex items-center gap-1.5 rounded-t px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap ${
              obj.type === 'person' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          >
            <span>{obj.label}</span>
          </div>
        </div>
      ))}
    </>
  );
}

export default function CameraStreamPlayer({ camera, onStateChange }: CameraStreamPlayerProps) {
  const [streamState, setStreamState] = useState<StreamState>('loading');
  const [useProxy, setUseProxy] = useState(!shouldUseDirectStream(camera));
  const [retryKey, setRetryKey] = useState(0);

  const proxiedUrl = useMemo(() => getProxiedStreamUrl(camera.id), [camera.id, retryKey]);
  const directUrl = camera.sourceUrl;

  useEffect(() => {
    setStreamState('loading');
    setUseProxy(!shouldUseDirectStream(camera));
    onStateChange?.('loading');
  }, [camera.id, camera.sourceType, camera.sourceUrl, onStateChange]);

  useEffect(() => {
    onStateChange?.(streamState);
  }, [streamState, onStateChange]);

  const handleLoad = () => setStreamState('playing');

  const handleError = () => {
    if (!useProxy && shouldUseDirectStream(camera)) {
      setUseProxy(true);
      setStreamState('loading');
      return;
    }
    setStreamState('error');
  };

  if (!isStreamSupported(camera)) {
    return (
      <div className="text-center px-6">
        <p className="text-sm font-medium text-gray-300">Тип камеры не поддерживается</p>
        <p className="mt-1 text-xs text-gray-500">
          USB и Web камеры будут доступны в следующей версии
        </p>
      </div>
    );
  }

  if (streamState === 'error') {
    return (
      <div className="text-center px-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-300">Видеопоток недоступен</p>
        <p className="mt-1 text-xs text-gray-500">Проверьте URL и доступность камеры</p>
        <button
          onClick={() => {
            setStreamState('loading');
            setRetryKey((k) => k + 1);
          }}
          className="mt-4 rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Повторить подключение
        </button>
      </div>
    );
  }

  const streamUrl = useProxy ? proxiedUrl : directUrl;
  const showVideo = isVideoFileUrl(useProxy ? camera.sourceUrl : directUrl);

  return (
    <div className="relative overflow-hidden rounded-lg bg-gray-800 w-full max-h-[calc(100vh-16rem)]">
      {streamState === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80">
          <svg className="h-8 w-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {showVideo ? (
        <video
          key={`${streamUrl}-${retryKey}`}
          src={streamUrl}
          autoPlay
          muted
          playsInline
          controls
          onLoadedData={handleLoad}
          onError={handleError}
          className="block w-full h-auto max-h-[calc(100vh-16rem)] object-contain"
          style={{ aspectRatio: '16/9' }}
        />
      ) : (
        <img
          key={`${streamUrl}-${retryKey}`}
          src={streamUrl}
          alt={camera.name}
          onLoad={handleLoad}
          onError={handleError}
          className="block w-full h-auto max-h-[calc(100vh-16rem)] object-contain"
          style={{ aspectRatio: '16/9' }}
        />
      )}

      {streamState === 'playing' && camera.detectionObjects.length > 0 && (
        <DetectionOverlay camera={camera} />
      )}

      <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1">
        <span className="text-[10px] text-gray-300">
          {camera.name} · {camera.resolution}
        </span>
      </div>
    </div>
  );
}

export type { StreamState };
