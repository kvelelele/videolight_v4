import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { Camera } from '../lib/mockData';
import { useClientAnalytics } from '../lib/clientAnalytics';
import {
  getProxiedStreamUrl,
  isHlsUrl,
  isStreamSupported,
  isVideoFileUrl,
  shouldUseDirectStream,
} from '../lib/streams';
import AnalyticsErrorBoundary from './AnalyticsErrorBoundary';
import DetectionOverlay from './DetectionOverlay';

type StreamState = 'loading' | 'playing' | 'error';

interface CameraStreamPlayerProps {
  camera: Camera;
  onStateChange?: (state: StreamState) => void;
}

export default function CameraStreamPlayer({ camera, onStateChange }: CameraStreamPlayerProps) {
  const [streamState, setStreamState] = useState<StreamState>('loading');
  const [useProxy, setUseProxy] = useState(!shouldUseDirectStream(camera));
  const [retryKey, setRetryKey] = useState(0);
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const isHls = isHlsUrl(camera.sourceUrl);
  const proxiedUrl = useMemo(() => getProxiedStreamUrl(camera.id), [camera.id, retryKey]);
  const directUrl = camera.sourceUrl;
  const streamUrl = useProxy ? proxiedUrl : directUrl;
  const showVideo = isHls || isVideoFileUrl(useProxy ? camera.sourceUrl : directUrl);

  // Delay analytics until playback is stable — avoids racing video mount / layout.
  useEffect(() => {
    if (streamState !== 'playing') {
      setAnalyticsReady(false);
      return;
    }
    const timer = window.setTimeout(() => setAnalyticsReady(true), 750);
    return () => window.clearTimeout(timer);
  }, [streamState]);

  const analyticsEnabled = analyticsReady;
  const mediaRef = showVideo ? videoRef : imgRef;
  const {
    frame: detectionFrame,
    ready: analyticsReadyFlag,
    loading: analyticsLoading,
    error: analyticsError,
  } = useClientAnalytics(mediaRef, camera.id, analyticsEnabled);
  // HLS must use backend proxy so Referer/UA are applied server-side.
  const hlsSourceUrl = isHls ? proxiedUrl : directUrl;

  useEffect(() => {
    setStreamState('loading');
    setUseProxy(!shouldUseDirectStream(camera));
    onStateChange?.('loading');
  }, [camera.id, camera.sourceType, camera.sourceUrl, onStateChange]);

  useEffect(() => {
    onStateChange?.(streamState);
  }, [streamState, onStateChange]);

  // HLS via proxied playlist (rewritten .m3u8 → /hls-asset segments).
  useEffect(() => {
    if (!isHls) return;

    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let cancelled = false;

    const markPlaying = () => {
      if (!cancelled) setStreamState('playing');
    };
    const markError = () => {
      if (!cancelled) setStreamState('error');
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.loadSource(hlsSourceUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().then(markPlaying).catch(markError);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) markError();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsSourceUrl;
      video.addEventListener('loadeddata', markPlaying);
      video.addEventListener('error', markError);
    } else {
      markError();
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', markPlaying);
      video.removeEventListener('error', markError);
      if (hls) {
        hls.destroy();
      } else {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [isHls, hlsSourceUrl, retryKey]);

  const handleLoad = () => setStreamState('playing');

  const handleError = () => {
    if (!useProxy && shouldUseDirectStream(camera) && !isHls) {
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
        <p className="mt-1 text-xs text-gray-500">
          {isHls
            ? 'HLS-токен мог истечь — скопируйте свежий live.m3u8?a=… со страницы камеры'
            : 'Проверьте URL и доступность камеры'}
        </p>
        <button
          onClick={() => {
            setStreamState('loading');
            setUseProxy(!shouldUseDirectStream(camera));
            setRetryKey((k) => k + 1);
          }}
          className="mt-4 rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Повторить подключение
        </button>
      </div>
    );
  }

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
          key={`${isHls ? hlsSourceUrl : streamUrl}-${retryKey}`}
          ref={videoRef}
          src={isHls ? undefined : streamUrl}
          autoPlay
          muted
          playsInline
          controls
          onLoadedData={isHls ? undefined : handleLoad}
          onError={isHls ? undefined : handleError}
          className="block w-full h-auto max-h-[calc(100vh-16rem)] object-contain"
          style={{ aspectRatio: '16/9' }}
        />
      ) : (
        <img
          key={`${streamUrl}-${retryKey}`}
          ref={imgRef}
          src={streamUrl}
          alt={camera.name}
          onLoad={handleLoad}
          onError={handleError}
          className="block w-full h-auto max-h-[calc(100vh-16rem)] object-contain"
          style={{ aspectRatio: '16/9' }}
        />
      )}

      <AnalyticsErrorBoundary>
        <DetectionOverlay
          frame={detectionFrame}
          mediaRef={mediaRef}
          visible={analyticsEnabled}
        />

        {(analyticsReadyFlag || analyticsLoading || analyticsError) && (
          <div className="absolute top-2 right-2 rounded-md bg-black/50 px-2 py-1">
            <span className={`text-[10px] ${analyticsError ? 'text-red-300' : 'text-emerald-300'}`}>
              {analyticsError
                ? 'Аналитика недоступна'
                : analyticsLoading
                  ? 'Загрузка модели…'
                  : `Детекция · ${detectionFrame?.tracks?.length ?? 0}`}
            </span>
          </div>
        )}
      </AnalyticsErrorBoundary>
      <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1">
        <span className="text-[10px] text-gray-300">
          {camera.name} · {camera.resolution}
        </span>
      </div>
    </div>
  );
}

export type { StreamState };
