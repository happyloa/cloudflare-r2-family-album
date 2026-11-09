'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMediaName } from '@/lib/media-name';

import { MediaFile } from './types';

function MediaBadge({ type }: { type: MediaFile['type'] }) {
  if (type === 'image') return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-end text-xs font-semibold text-white">
      <span className="rounded-md bg-surface-950/80 px-2 py-1 text-xs text-surface-100">
        影片
      </span>
    </div>
  );
}

function VideoPreview({ src, alt, onReady }: { src: string; alt: string; onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [canPreview, setCanPreview] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [wantsPlayback, setWantsPlayback] = useState(false);
  const hasNotifiedRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (hasNotifiedRef.current) return;
    hasNotifiedRef.current = true;
    onReady();
  }, [onReady]);

  useEffect(() => {
    hasNotifiedRef.current = false;
    const video = videoRef.current;
    if (!video) return undefined;

    setCanPreview(true);
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, notifyReady]);

  useEffect(() => {
    if (shouldLoad) return;
    const video = videoRef.current;
    if (!video) return;
    if (typeof IntersectionObserver === 'undefined') { setShouldLoad(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setShouldLoad(true);
    }, { rootMargin: '300px' });
    observer.observe(video);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad || !wantsPlayback) return;
    let cancelled = false;
    void video.play().catch(() => {
      // Leaving a card can cancel play() before it resolves; that is not a format error.
      if (!cancelled) { setCanPreview(false); notifyReady(); }
    });
    return () => { cancelled = true; video.pause(); };
  }, [shouldLoad, wantsPlayback, notifyReady]);

  const startPreview = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setShouldLoad(true);
    setWantsPlayback(true);
  };

  if (!canPreview) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-900 text-surface-100">
        <div className="flex flex-col items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-surface-800/70 px-3 py-1 text-[11px] text-surface-200">影片</span>
          <p className="text-center text-surface-400">無法顯示縮圖，點擊查看檔案</p>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-cover"
      src={shouldLoad ? src : undefined}
      muted
      playsInline
      loop
      draggable={false}
      preload="metadata"
      aria-label={alt}
      onPointerEnter={startPreview}
      onPointerLeave={() => setWantsPlayback(false)}
      onFocus={startPreview}
      onBlur={() => setWantsPlayback(false)}
      onLoadedData={notifyReady}
      onError={() => { setCanPreview(false); notifyReady(); }}
    />
  );
}

export function MediaThumbnail({ media }: { media: MediaFile }) {
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const isLoaded = loadedUrl === media.url;
  const handleReady = useCallback(() => setLoadedUrl(media.url), [media.url]);

  return (
    <div className="media-frame relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-900">
      <div
        className={`absolute inset-0 bg-surface-800 transition-opacity duration-300 ${isLoaded ? 'opacity-0' : 'opacity-100'
          }`}
      />
      {failedUrl === media.url ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-surface-400">
          無法顯示縮圖，點擊查看檔案
        </div>
      ) : media.type === 'image' ? (
        <img
          src={media.url}
          alt={getMediaName(media.key)}
          draggable={false}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          onLoad={handleReady}
          onError={() => { setFailedUrl(media.url); handleReady(); }}
        />
      ) : (
        <>
          {!isLoaded && <div className="absolute inset-0 backdrop-blur-sm transition-opacity duration-500" />}
          <VideoPreview key={media.url} src={media.url} alt={getMediaName(media.key)} onReady={handleReady} />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="flex size-12 items-center justify-center rounded-full border border-white/20 bg-surface-950/60 text-white shadow-lg">
              <svg className="size-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </div>
        </>
      )}
      <MediaBadge type={media.type} />
    </div>
  );
}
