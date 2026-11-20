import { useCallback, useEffect, useState } from 'react';

import { MessageTone } from '../types';

/**
 * useMessage Hook: 全域訊息提示管理
 * 提供顯示訊息 (info, success, error) 並自動消失的功能；錯誤需要較長的閱讀時間，停留 10 秒
 */
export function useMessage() {
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');

  const pushMessage = useCallback((text: string, tone: MessageTone = 'info') => {
    setMessageTone(tone);
    setMessage(text);
  }, []);

  // 設定自動消失計時器
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), messageTone === 'error' ? 10000 : 5000);
    return () => clearTimeout(timer);
  }, [message, messageTone]);

  return {
    message,
    messageTone,
    pushMessage
  };
}
