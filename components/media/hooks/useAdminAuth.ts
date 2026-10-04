import { useCallback, useEffect, useRef, useState } from "react";

import {
  ADMIN_SESSION_DURATION_MS,
  ADMIN_TOKEN_STORAGE_KEY,
  MAX_ADMIN_TOKEN_LENGTH,
} from "../constants";
import { MessageTone } from "../types";

type UseAdminAuthProps = {
  pushMessage: (text: string, tone: MessageTone) => void;
  openPassword: (opts: {
    title?: string;
    message?: string;
    onSubmit: (value: string) => Promise<boolean>;
  }) => Promise<boolean>;
};

/**
 * useAdminAuth Hook: 管理員權限控制
 * 包含：Token 驗證、Session 儲存、逾時自動登出、以及發送帶有 Auth Header 的請求
 */
export function useAdminAuth({ pushMessage, openPassword }: UseAdminAuthProps) {
  const [adminToken, setAdminToken] = useState("");
  const isAdmin = Boolean(adminToken);
  const adminTimeoutRef = useRef<number | null>(null);
  // 同步保存最新 token，供非同步流程（如拖曳上傳）在 setState 尚未 flush 時讀取
  const adminTokenRef = useRef("");
  const validationVersionRef = useRef(0);

  // 清除管理員 Session (登出)
  const clearAdminSession = useCallback(
    (notice?: string) => {
      validationVersionRef.current += 1;
      setAdminToken("");
      adminTokenRef.current = "";
      if (typeof window !== "undefined") {
        try { sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); } catch { /* 瀏覽器可能停用儲存。 */ }
      }

      if (adminTimeoutRef.current) {
        window.clearTimeout(adminTimeoutRef.current);
        adminTimeoutRef.current = null;
      }

      if (notice) {
        pushMessage(notice, "info");
      }
    },
    [pushMessage],
  );

  // 重設逾時倒數計時器
  const resetAdminTimeout = useCallback(() => {
    if (adminTimeoutRef.current) {
      window.clearTimeout(adminTimeoutRef.current);
    }

    // 重新點擊會刷新計時，避免長時間閒置導致管理者操作到一半被踢出
    adminTimeoutRef.current = window.setTimeout(() => {
      clearAdminSession("管理模式已逾時，請重新輸入。");
    }, ADMIN_SESSION_DURATION_MS);
  }, [clearAdminSession]);

  // 驗證並套用 Token
  const validateAndApplyToken = useCallback(
    async (token: string, options?: { silent?: boolean }) => {
      const version = ++validationVersionRef.current;
      const trimmed = token.trim();
      if (!trimmed) {
        clearAdminSession(options?.silent ? undefined : "請輸入管理密碼");
        return false;
      }

      if (trimmed.length > MAX_ADMIN_TOKEN_LENGTH) {
        if (!options?.silent) {
          pushMessage(`管理密碼最多 ${MAX_ADMIN_TOKEN_LENGTH} 個字`, "error");
        }
        clearAdminSession();
        return false;
      }

      if (!options?.silent) {
        pushMessage("正在驗證管理密碼…", "info");
      }

      try {
        const response = await fetch("/api/media", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": trimmed,
          },
          body: JSON.stringify({ action: "validate" }),
          signal: AbortSignal.timeout(10000),
        });
        if (version !== validationVersionRef.current) return false;

        if (!response.ok) {
          let payload: {
            remainingAttempts?: number;
            retryAfterMinutes?: number;
          } | null = null;
          try {
            payload = (await response.json()) as {
              remainingAttempts?: number;
              retryAfterMinutes?: number;
            };
          } catch {
            payload = null;
          }

          clearAdminSession();
          if (!options?.silent) {
            if (response.status === 429) {
              const minutes = payload?.retryAfterMinutes ?? 5;
              pushMessage(
                `因密碼輸入不正確，請於 ${minutes} 分鐘後再試`,
                "error",
              );
            } else if (
              response.status === 401 &&
              typeof payload?.remainingAttempts === "number"
            ) {
              pushMessage(
                `管理密碼不正確，還有 ${payload.remainingAttempts} 次機會`,
                "error",
              );
            } else if (response.status === 401) {
              pushMessage("管理密碼不正確，請再試一次", "error");
            } else {
              pushMessage("管理驗證服務暫時無法使用，請稍後再試。", "error");
            }
          }
          return false;
        }

        setAdminToken(trimmed);
        adminTokenRef.current = trimmed;
        try { sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed); } catch { /* 保留記憶體內的管理狀態。 */ }
        resetAdminTimeout();
        if (!options?.silent) pushMessage("已啟用管理模式", "success");
        return true;
      } catch {
        if (!options?.silent) {
          pushMessage("驗證時出現錯誤，請檢查網路後重試。", "error");
        }
        return false;
      }
    },
    [clearAdminSession, pushMessage, resetAdminTimeout],
  );

  // 請求輸入管理員 Token (用於敏感操作前)
  // 改用 App 內密碼對話框，驗證失敗時對話框會保持開啟讓使用者重試。
  const requestAdminToken = useCallback(
    async (promptMessage = "請輸入管理密碼以繼續"): Promise<boolean> => {
      if (!adminTokenRef.current) {
        const ok = await openPassword({
          message: promptMessage,
          onSubmit: async (value) => validateAndApplyToken(value),
        });
        if (!ok) return false;
      }

      resetAdminTimeout();
      return true;
    },
    [openPassword, validateAndApplyToken, resetAdminTimeout],
  );

  // 初始化檢查 Session Storage
  useEffect(() => {
    let saved = '';
    try { saved = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? ''; } catch { /* 儲存不可用。 */ }
    let frame = 0;
    if (saved) {
      // 避免在 effect 中同步呼叫 setState 導致的問題
      // 使用 requestAnimationFrame 將執行推遲到下一幀
      frame = requestAnimationFrame(() => {
        void validateAndApplyToken(saved, { silent: true });
      });
    }
    return () => {
      cancelAnimationFrame(frame);
      validationVersionRef.current += 1;
      if (adminTimeoutRef.current) window.clearTimeout(adminTimeoutRef.current);
    };
    // 僅在掛載時檢查一次 sessionStorage
  }, []);

  // 離開頁面時清除 Session (安全性考量)
  useEffect(() => {
    const handleBeforeUnload = () => {
      try { sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); } catch { /* 儲存不可用。 */ }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // 包裝過的 Fetch，自動帶入 Admin Token
  const authorizedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      const token = adminTokenRef.current;
      if (token) {
        headers.set("x-admin-token", token);
      }
      const response = await fetch(input, { ...init, headers });
      if (response.status === 401 && token && token === adminTokenRef.current) clearAdminSession();
      return response;
    },
    [clearAdminSession],
  );

  return {
    adminToken,
    adminTokenRef,
    isAdmin,
    validateAndApplyToken,
    clearAdminSession,
    requestAdminToken,
    authorizedFetch,
  };
}
