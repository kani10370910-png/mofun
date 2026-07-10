"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

/* 全局居中确认/输入弹窗：替代原生 window.confirm / window.prompt（浏览器"localhost 显示"样式）。
   用法：await appConfirm("确定删除？") / await appPrompt("重命名", 旧值)。
   需在应用根部挂一个 <ConfirmHost />（见 AppShell）。未挂载时回退原生弹窗兜底。 */

type ConfirmOpts = { message: string; title?: string; confirmText?: string; cancelText?: string; danger?: boolean };
type Req =
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOpts)
  | { kind: "prompt"; message: string; title?: string; defaultValue: string; confirmText?: string; cancelText?: string; resolve: (v: string | null) => void };

let enqueue: ((r: Req) => void) | null = null;

export function appConfirm(opts: string | ConfirmOpts): Promise<boolean> {
  const o: ConfirmOpts = typeof opts === "string" ? { message: opts } : opts;
  return new Promise<boolean>((resolve) => {
    if (enqueue) enqueue({ kind: "confirm", ...o, resolve });
    else resolve(typeof window !== "undefined" ? window.confirm(o.message) : false);
  });
}

export function appPrompt(message: string, defaultValue = "", title?: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (enqueue) enqueue({ kind: "prompt", message, title, defaultValue, resolve });
    else resolve(typeof window !== "undefined" ? window.prompt(message, defaultValue) : null);
  });
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const [val, setVal] = useState("");
  const cur = queue[0];

  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r]);
    return () => {
      enqueue = null;
    };
  }, []);
  useEffect(() => {
    if (cur?.kind === "prompt") setVal(cur.defaultValue ?? "");
  }, [cur]);

  if (!cur) return null;

  const finish = (result: boolean | string | null) => {
    (cur.resolve as (v: boolean | string | null) => void)(result);
    setQueue((q) => q.slice(1));
  };
  const onConfirm = () => finish(cur.kind === "prompt" ? val : true);
  const onCancel = () => finish(cur.kind === "prompt" ? null : false);
  const danger = cur.kind === "confirm" && cur.danger;

  return createPortal(
    <div className="app-confirm-mask" onClick={onCancel}>
      <div className="sh-dialog app-confirm-box" onClick={(e) => e.stopPropagation()}>
        {cur.title && <div className="sh-dialog-title">{cur.title}</div>}
        <div className="app-confirm-msg">{cur.message}</div>
        {cur.kind === "prompt" && (
          <input
            className="sh-dialog-input app-confirm-input"
            value={val}
            autoFocus
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
              if (e.key === "Escape") onCancel();
            }}
          />
        )}
        <div className="sh-dialog-acts">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            {cur.cancelText ?? "取消"}
          </button>
          <button className={`btn btn-sm ${danger ? "app-confirm-danger" : "btn-primary"}`} onClick={onConfirm} autoFocus={cur.kind !== "prompt"}>
            {cur.confirmText ?? "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
