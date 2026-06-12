import { useCallback, useState } from 'react';

export type PasswordRequest = {
  title: string;
  message: string;
  onSubmit: (value: string) => Promise<boolean>;
  resolve: (value: boolean) => void;
};

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (value: boolean) => void;
};

/**
 * useDialogs Hook: 以 Promise 驅動的 App 內對話框，取代原生 window.prompt / window.confirm。
 * - openPassword：開啟密碼輸入框，由呼叫端提供 onSubmit 做驗證（驗證失敗時對話框會保持開啟）。
 * - confirm：開啟確認框，resolve true/false。
 */
export function useDialogs() {
  const [passwordReq, setPasswordReq] = useState<PasswordRequest | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  const openPassword = useCallback(
    (opts: {
      title?: string;
      message?: string;
      onSubmit: (value: string) => Promise<boolean>;
    }) =>
      new Promise<boolean>((resolve) => {
        setPasswordReq({
          title: opts.title ?? '需要管理密碼',
          message: opts.message ?? '請輸入管理密碼以繼續',
          onSubmit: opts.onSubmit,
          resolve
        });
      }),
    []
  );

  const confirm = useCallback(
    (opts: {
      title?: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
    }) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({
          title: opts.title ?? '請確認',
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? '確認',
          cancelLabel: opts.cancelLabel ?? '取消',
          danger: Boolean(opts.danger),
          resolve
        });
      }),
    []
  );

  const closePassword = useCallback((value: boolean) => {
    setPasswordReq((req) => {
      req?.resolve(value);
      return null;
    });
  }, []);

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmReq((req) => {
      req?.resolve(value);
      return null;
    });
  }, []);

  return { passwordReq, confirmReq, openPassword, confirm, closePassword, closeConfirm };
}
