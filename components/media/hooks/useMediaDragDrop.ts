import { DragEvent, useState } from 'react';

import { AdminActionType } from '../AdminActionModal';
import { MAX_FOLDER_DEPTH } from '../constants';
import { getDepth, sanitizePath } from '../sanitize';
import { MessageTone } from '../types';

type DragItem = { key: string; isFolder: boolean };

type UseMediaDragDropProps = {
  isAdmin: boolean;
  currentPrefix: string;
  requestAdminToken: (promptMessage?: string) => Promise<boolean>;
  pushMessage: (text: string, tone: MessageTone) => void;
  handleAdminActionConfirm: (payload: {
    action: AdminActionType;
    key: string;
    isFolder: boolean;
    targetPrefix?: string;
  }) => Promise<void>;
};

/**
 * useMediaDragDrop Hook: 處理媒體與資料夾的拖曳移動
 * 允許管理員把檔案或資料夾拖到其它資料夾，或拖到「回到上一層」區域。
 * 資料夾移動會擋掉「移到自己/子孫」與超過層數的情況。
 */
export function useMediaDragDrop({
  isAdmin,
  currentPrefix,
  requestAdminToken,
  pushMessage,
  handleAdminActionConfirm
}: UseMediaDragDropProps) {
  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null);

  // 開始拖曳
  const handleItemDragStart = (item: DragItem, event: DragEvent<HTMLElement>) => {
    if (!isAdmin) return;
    event.dataTransfer.effectAllowed = 'move';
    // 延遲更新狀態，避免因 React 重新渲染導致 DOM 變更而中斷原生拖曳
    setTimeout(() => setDraggingItem(item), 0);
  };

  // 結束拖曳
  const handleItemDragEnd = () => setDraggingItem(null);

  // 放置：把拖曳中的項目移動到目標路徑
  const moveDraggedItemTo = async (targetPrefix: string) => {
    if (!draggingItem || !isAdmin) return;
    const item = draggingItem;
    const sanitizedTarget = sanitizePath(targetPrefix);

    // 資料夾不可移動到自己或其子孫
    if (item.isFolder && (sanitizedTarget === item.key || sanitizedTarget.startsWith(`${item.key}/`))) {
      pushMessage('無法移動到自己或其子資料夾', 'error');
      return;
    }

    const targetDepth = getDepth(sanitizedTarget);
    const resultingDepth = item.isFolder ? targetDepth + 1 : targetDepth;
    if (resultingDepth > MAX_FOLDER_DEPTH) {
      pushMessage('路徑深度超過限制，無法移動', 'error');
      return;
    }

    // 已在此位置（目標等於目前所在的父層）
    const currentParent = item.key.split('/').slice(0, -1).join('/');
    if (sanitizedTarget === currentParent) {
      pushMessage(item.isFolder ? '資料夾已在此位置' : '媒體已在此資料夾', 'info');
      return;
    }

    const allowed = await requestAdminToken('請輸入管理密碼以移動項目');
    if (!allowed) return;

    await handleAdminActionConfirm({
      action: 'move',
      key: item.key,
      isFolder: item.isFolder,
      targetPrefix: sanitizedTarget
    });

    setDraggingItem(null);
  };

  return {
    draggingItem,
    isDragging: Boolean(draggingItem),
    handleItemDragStart,
    handleItemDragEnd,
    moveDraggedItemTo
  };
}
