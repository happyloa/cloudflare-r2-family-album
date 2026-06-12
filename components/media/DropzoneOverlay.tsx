'use client';

export function DropzoneOverlay({
  active,
  uploading,
  progress,
  targetLabel
}: {
  active: boolean;
  uploading: boolean;
  progress: number;
  targetLabel: string;
}) {
  if (!active && !uploading) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-surface-950/80 p-6 backdrop-blur-sm animate-modal-backdrop-in">
      <div className="flex w-[min(520px,92vw)] flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-primary-400/60 bg-surface-900/90 px-8 py-12 text-center shadow-2xl">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-500/15 text-4xl ring-1 ring-primary-500/30">
          {uploading ? '⏳' : '⬆️'}
        </div>
        {uploading ? (
          <div className="w-full space-y-3">
            <p className="text-lg font-semibold text-white">上傳中… {progress}%</p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-teal-500 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xl font-bold text-white">放開即可上傳到這裡</p>
            <p className="text-sm text-surface-400">
              將上傳到「{targetLabel}」，圖片會自動壓縮。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
