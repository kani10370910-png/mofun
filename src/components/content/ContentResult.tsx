"use client";

import { useToast } from "@/components/ui/Toast";
import type { ContentScene } from "@/lib/types";

/* 普通文案结果卡（流式逐字填充 text；loading 时显示生成中光标） */
export function ContentResult({
  scene,
  text,
  loading,
  isOutline,
  onReOutline,
  onToFull,
}: {
  scene: ContentScene;
  text: string;
  loading: boolean;
  isOutline?: boolean;
  onReOutline?: () => void;
  onToFull?: () => void;
}) {
  const toast = useToast();

  if (isOutline) {
    return (
      <>
        <div className="result-card">
          <div className="result-head">
            <span className="rh-title">📑 公众号 · 提纲</span>
            <span className="tag green">确认后写全文</span>
          </div>
          <div className="result-body">
            {text}
            {loading && <span className="gen-cursor" />}
          </div>
          <div className="result-foot">
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={onReOutline}>
              🔁 换个提纲
            </button>
            <button className="btn btn-primary btn-sm" disabled={loading || !text} onClick={onToFull}>
              ✍️ 按此提纲生成全文 →
            </button>
          </div>
        </div>
        <p className="empty-note" style={{ marginTop: 10 }}>
          提纲可参考确认，满意后再生成全文，避免长文返工。
        </p>
      </>
    );
  }

  return (
    <>
      <div className="result-card">
        <div className="result-head">
          <span className="rh-title">
            {scene.ico} {scene.title} · 生成结果
          </span>
          <span className="tag green">{scene.tag}</span>
        </div>
        <div className="result-body">
          {text}
          {loading && <span className="gen-cursor" />}
        </div>
        <div className="result-foot" style={{ flexWrap: "wrap" }}>
          <button
            className="btn btn-soft btn-sm"
            disabled={!text}
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(text);
                toast("已复制到剪贴板");
              }
            }}
          >
            📋 复制
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!text} onClick={() => toast("已对文案执行「润色」（演示）")}>
            ✨ 润色
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!text} onClick={() => toast("已对文案执行「续写」（演示）")}>
            ➕ 续写
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!text} onClick={() => toast("已对文案执行「改写」（演示）")}>
            🔄 改写
          </button>
          <button className="btn btn-primary btn-sm" disabled={!text} onClick={() => toast("已存入个人仓库（演示）")}>
            📦 存入个人仓库
          </button>
        </div>
      </div>
      <p className="empty-note" style={{ marginTop: 10 }}>
        提示：文案为真实 AI 生成结果，可复制后二次编辑；润色 / 续写 / 改写为演示操作。
      </p>
    </>
  );
}
