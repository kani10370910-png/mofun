"use client";

/* 通用确认弹框：标题 + 取消 / 确认 两枚药丸按钮 */
export function ConfirmModal({
  title,
  cancelText = "取消",
  confirmText = "删除",
  onCancel,
  onConfirm,
}: {
  title: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button className="confirm-btn confirm-ok" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
