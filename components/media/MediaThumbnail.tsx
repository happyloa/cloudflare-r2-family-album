'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaFile } from './types';

function MediaBadge({ type }: { type: MediaFile['type'] }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-end text-xs font-semibold text-white">
      <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] uppercase tracking-[0.15em] text-slate-100 ring-1 ring-slate-700">
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
        await video.play();
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
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-slate-800/70 px-3 py-1 text-[11px] text-slate-200">行動裝置預覽</span>
          <p className="text-center text-slate-400">點擊後將載入影片</p>
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
      onCanPlay={notifyReady}
      onLoadedData={notifyReady}
      onError={notifyReady}
    />
  );
}

const BLUR_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImEiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyODI1MjMiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM0NDQwM2MiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTIiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=';

export function MediaThumbnail({ media }: { media: MediaFile }) {
  const [loadedUrl, setLoadedUrl] = useState('');
  const isLoaded = loadedUrl === media.url;
  const handleReady = useCallback(() => setLoadedUrl(media.url), [media.url]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
      <div
        className={`absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 transition-opacity duration-500 ${isLoaded ? 'opacity-0' : 'opacity-100'
          }`}
      />
      {media.type === 'image' ? (
        <Image
          src={media.url}
          alt={media.key}
          fill
          draggable={false}
          sizes="(min-width: 1024px) 25vw, 50vw"
          className={`object-cover transition-[opacity,filter,transform] duration-500 ${isLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-80 blur-xl scale-105'
            }`}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          onLoadingComplete={handleReady}
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
