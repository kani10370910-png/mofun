"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastType = "info" | "warn" | "success";

interface ToastState {
  id: number;
  text: string;
  type: ToastType;
  leaving: boolean;
}

type ToastFn = (text: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** 全局 toast：toast("xxx") 普通提示；toast("请填写…", "warn") 顶部警告卡 */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const seq = useRef(0);

  const toast = useCallback<ToastFn>((text, type = "info") => {
    const id = ++seq.current;
    setToasts((prev) => [...prev, { id, text, type, leaving: false }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, type === "warn" ? 3600 : 2200);
  }, []);

  // 仓库配额失败：全局可见提示（各模块入库失败时也会派发此事件）
  useEffect(() => {
    const onQuota = () => {
      toast("本地仓库空间不足，作品可能未保存。请到「仓库」删除旧内容后重试", "warn");
    };
    window.addEventListener("mofun:storage-quota", onQuota);
    return () => window.removeEventListener("mofun:storage-quota", onQuota);
  }, [toast]);

  const top = toasts.filter((t) => t.type === "warn");
  const bottom = toasts.filter((t) => t.type !== "warn");

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* 顶部居中：警告/必填校验（白卡 + 橙色感叹号） */}
      <div className="toast-host toast-host-top" aria-live="assertive">
        {top.map((t) => (
          <div key={t.id} className={`toast toast-warn ${t.leaving ? "toast-leave" : ""}`}>
            <span className="toast-ico" aria-hidden>
              !
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {/* 底部居中：普通演示提示 */}
      <div className="toast-host toast-host-bottom" aria-live="polite">
        {bottom.map((t) => (
          <div key={t.id} className={`toast ${t.leaving ? "toast-leave" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
