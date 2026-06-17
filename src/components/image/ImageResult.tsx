"use client";

import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { imageTools, imageResults } from "@/data/image";
import type { IconName } from "@/data/icons";

const toolIcon = (key: string): IconName =>
  ("tool" + key.charAt(0).toUpperCase() + key.slice(1)) as IconName;

/* 图片生成结果（模拟）：按数量切片渲染 emoji 占位卡 + AI 处理工具悬浮 */
export function ImageResult({
  count,
  size,
  model,
  refStrength,
  onRegenerate,
}: {
  count: number;
  size: string;
  model: string;
  refStrength: string;
  onRegenerate: () => void;
}) {
  const toast = useToast();
  const cards = imageResults.slice(0, count);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <span className="rh-title" style={{ color: "var(--c-primary-dark)", fontWeight: 600 }}>
          🎨 已生成 {count} 套候选
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onRegenerate}>
          🔁 再生成一批
        </button>
      </div>
      <div className="param-recap">
        参数：{model} · {size} · 参考强度 {refStrength}
      </div>
      <div className={count === 1 ? "grid" : "grid grid-2"} style={{ marginTop: 12 }}>
        {cards.map((r, i) => (
          <div className={`img-result ${r.grad}`} key={i}>
            <span className="ir-emoji">{r.emoji}</span>
            <span className="ir-tag">{r.tag}</span>
            <div className="ir-actions">
              <div className="ir-tools">
                {imageTools.map((t) => (
                  <button
                    key={t.key}
                    className="ir-tool"
                    title={t.name}
                    onClick={() => toast(`已对该图执行「${t.name}」（演示）`)}
                  >
                    <Icon name={toolIcon(t.key)} size={18} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
              <div className="ir-actions-row">
                <button className="btn btn-soft btn-sm" onClick={() => toast("已对该图执行「高清下载」（演示）")}>
                  下载
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ background: "#fff" }}
                  onClick={() => toast("已对该图执行「做同款」（演示）")}
                >
                  做同款
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="empty-note" style={{ marginTop: 12 }}>
        悬停图片可对其执行 AI 变清晰 / 消除 / 抠图 / 扩图 / 转矢量 / 细节修复等再加工。
      </p>
    </>
  );
}
