'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaFile } from './types';

function MediaBadge({ type }: { type: MediaFile['type'] }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-end text-xs font-semibold text-white">
      <span className="rounded-lg bg-surface-900/80 px-2 py-1 text-[11px] uppercase tracking-[0.15em] text-surface-100 ring-1 ring-surface-700">
        {type === 'image' ? '圖片' : '影片'}
      </span>
    </div>
  );
}

function VideoPreview({ src, alt, onReady }: { src: string; alt: string; onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [canPreview, setCanPreview] = useState(true);
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

    const startSilentPreview = async () => {
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = 'metadata';

      try {
        // iOS/Safari 需要觸發 play() 才會渲染第一幀，若失敗則改用備援畫面
        setCanPreview(true);
        // 完成第一幀渲染後再交由 canplay 事件觸發 ready 通知
      } catch (error) {
        console.warn('Video preview fallback:', error);
        setCanPreview(false);
        notifyReady();
      }
    };

    startSilentPreview();
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, notifyReady]);

  if (!canPreview) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 text-surface-100">
        <div className="flex flex-col items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-surface-800/70 px-3 py-1 text-[11px] text-surface-200">行動裝置預覽</span>
          <p className="text-center text-surface-400">點擊後將載入影片</p>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-cover"
      src={src}
      muted
      playsInline
      loop
      draggable={false}
      preload="metadata"
      aria-label={alt}
      onPointerEnter={() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const video = videoRef.current;
        if (!video) return;
        void video.play().catch(() => {
          setCanPreview(false);
          notifyReady();
        });
      }}
      onPointerLeave={() => videoRef.current?.pause()}
      onFocus={() => {
        const video = videoRef.current;
        if (video && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          void video.play().catch(() => setCanPreview(false));
        }
      }}
      onBlur={() => videoRef.current?.pause()}
      onLoadedData={notifyReady}
      onError={notifyReady}
    />
  );
}

export function MediaThumbnail({ media }: { media: MediaFile }) {
  const [loadedUrl, setLoadedUrl] = useState('');
  const isLoaded = loadedUrl === media.url;
  const handleReady = useCallback(() => setLoadedUrl(media.url), [media.url]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-surface-900">
      <div
        className={`absolute inset-0 bg-gradient-to-br from-surface-800 via-surface-900 to-surface-950 transition-opacity duration-500 ${isLoaded ? 'opacity-0' : 'opacity-100'
          }`}
      />
      {media.type === 'image' ? (
        <img
          src={media.url}
          alt={media.key}
          draggable={false}
          className={`h-full w-full object-cover transition-[opacity,filter,transform] duration-500 ${isLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-80 blur-xl scale-105'
            }`}
          onLoad={handleReady}
          onError={handleReady}
        />
      ) : (
        <>
          {!isLoaded && <div className="absolute inset-0 backdrop-blur-sm transition-opacity duration-500" />}
          <VideoPreview src={media.url} alt={media.key} onReady={handleReady} />
        </>
      )}
      <MediaBadge type={media.type} />
    </div>
  );
}
