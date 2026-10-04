'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getMediaName } from '@/lib/media-name';

import { MediaFile } from './types';
import { useFocusTrap } from './hooks/useFocusTrap';

function NavArrow({
  direction,
  onClick,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
}) {
  const isPrev = direction === 'prev';

  return (
    <button
      className="absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-surface-900/70 text-white/70 backdrop-blur-sm transition-all duration-200 hover:border-primary-400/40 hover:bg-surface-800/90 hover:text-white hover:shadow-lg hover:shadow-primary-500/10 active:scale-90"
      style={isPrev ? { left: '0.75rem' } : { right: '0.75rem' }}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={isPrev ? '上一個' : '下一個'}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={isPrev ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
        />
      </svg>
    </button>
  );
}

export function MediaPreviewModal({
  media,
  allFiles = [],
  onClose,
  onNavigate,
  triggerElement
}: {
  media: MediaFile | null;
  allFiles?: MediaFile[];
  onClose: () => void;
  onNavigate?: (file: MediaFile) => void;
  triggerElement?: HTMLElement | null;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const mediaName = media ? getMediaName(media.key) : '';
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const open = media !== null;
  const dialogRef = useFocusTrap<HTMLDivElement>(open, {
    onEscape: onClose,
    initialFocus: closeButtonRef,
    returnFocus: triggerElement
  });
  const hasFailed = media?.url === failedUrl;
  const isLoaded = media ? loadedUrl === media.url : false;
  const markLoaded = () => {
    if (media?.url) {
      setLoadedUrl(media.url);
    }
  };

  // Navigation state
  const currentIndex = useMemo(() => {
    if (!media || allFiles.length === 0) return -1;
    return allFiles.findIndex((f) => f.key === media.key);
  }, [media, allFiles]);

  const canNavigate = allFiles.length > 1 && currentIndex >= 0;
  const hasPrev = canNavigate && currentIndex > 0;
  const hasNext = canNavigate && currentIndex < allFiles.length - 1;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= allFiles.length || !onNavigate) return;
      setLoadedUrl(''); // Reset loading state for new media
      onNavigate(allFiles[index]);
    },
    [allFiles, onNavigate]
  );

  const goPrev = useCallback(() => {
    if (hasPrev) goTo(currentIndex - 1);
  }, [hasPrev, currentIndex, goTo]);

  const goNext = useCallback(() => {
    if (hasNext) goTo(currentIndex + 1);
  }, [hasNext, currentIndex, goTo]);
  const handlersRef = useRef({ goPrev, goNext });
  handlersRef.current = { goPrev, goNext };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current?.contains(event.target as Node) || event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.key === 'ArrowLeft') handlersRef.current.goPrev();
        else handlersRef.current.goNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, dialogRef]);

  if (!media) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen w-screen items-center justify-center overflow-y-auto bg-surface-950/90 p-4 backdrop-blur-md sm:p-6 animate-modal-backdrop-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        className="relative max-h-[calc(100dvh-2rem)] w-[min(1100px,92vw)] overflow-y-auto rounded-3xl border border-surface-700/50 bg-surface-900/95 shadow-2xl animate-modal-content-in"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-surface-800 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 line-clamp-2 break-all text-sm font-semibold text-white" id={titleId} title={mediaName}>
                {mediaName}
              </p>
              {canNavigate ? (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-800 px-2 py-0.5 text-xs font-medium tabular-nums text-surface-400">
                  {currentIndex + 1} / {allFiles.length}
                </span>
              ) : null}
            </div>
            {media.size ? <p className="text-xs text-surface-500">{(media.size / 1024 / 1024).toFixed(2)} MB</p> : null}
            <p className="sr-only" id={descriptionId}>
              {media.type === 'image' ? '圖片' : '影片'} 預覽{media.size ? `，大小 ${(media.size / 1024 / 1024).toFixed(2)} MB` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              className="rounded-full border border-surface-700 px-3 py-1.5 text-xs font-semibold text-surface-100 transition-all duration-200 hover:border-primary-500/50 hover:text-primary-100 whitespace-nowrap"
              href={media.url}
              target="_blank"
              rel="noreferrer"
            >
              在新分頁開啟
            </a>
            <button
              className="rounded-full bg-gradient-to-r from-primary-500 to-accent-500 px-4 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-accent-400 cursor-pointer whitespace-nowrap"
              type="button"
              onClick={onClose}
              ref={closeButtonRef}
            >
              關閉
            </button>
          </div>
        </div>
        <div className="relative flex items-center justify-center bg-surface-950/80 p-4 sm:p-6">
          {/* Navigation arrows */}
          {hasPrev ? <NavArrow direction="prev" onClick={goPrev} /> : null}
          {hasNext ? <NavArrow direction="next" onClick={goNext} /> : null}

          <div className="relative aspect-[16/10] max-h-[calc(100dvh-12rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-surface-800 bg-black">
            {!isLoaded && !hasFailed && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-950/60">
                <span
                  className="h-12 w-12 animate-spin rounded-full border-2 border-primary-400/60 border-t-transparent"
                  aria-hidden="true"
                />
              </div>
            )}
            {hasFailed ? (
              <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-12 text-center text-sm text-surface-300">
                <p>無法載入預覽。可在新分頁開啟，或下載後查看。</p>
                <button type="button" className="rounded-lg border border-surface-600 px-3 py-2" onClick={() => setFailedUrl('')}>重新載入</button>
              </div>
            ) : media.type === 'image' ? (
              <img
                src={media.url}
                alt={mediaName}
                draggable={false}
                loading="lazy"
                decoding="async"
                className={`h-full w-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={markLoaded}
                onError={() => setFailedUrl(media.url)}
              />
            ) : (
              <video
                className={`h-full w-full bg-black object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                src={media.url}
                controls
                autoPlay
                draggable={false}
                preload="metadata"
                playsInline
                onCanPlay={markLoaded}
                onLoadedData={markLoaded}
                onError={() => setFailedUrl(media.url)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
