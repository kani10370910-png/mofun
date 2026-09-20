"use client";

import { Icon } from "@/components/ui/Icon";

export type ResultMedia = { src: string; kind: "image" | "video" };

export function isVideoSrc(src: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(src) || src.includes("/video");
}

export function mediaFromUrls(urls: string[]): ResultMedia[] {
  const seen = new Set<string>();
  const out: ResultMedia[] = [];
  for (const src of urls) {
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, kind: isVideoSrc(src) ? "video" : "image" });
  }
  return out;
}

export function ResultPane({
  items,
  index,
  onIndex,
  onClose,
  onAddToChat,
  onSaveMaterial,
  onDownload,
  onPreview,
}: {
  items: ResultMedia[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onAddToChat: () => void;
  onSaveMaterial: () => void;
  onDownload: () => void;
  onPreview?: (src: string) => void;
}) {
  const cur = items[index];
  if (!cur) return null;

  const multi = items.length > 1;
  return (
    <aside className={`hc-result-pane${multi ? " has-thumbs" : ""}`} aria-label="生成结果">
      <div className="hc-result-head">
        <div className="hc-result-acts">
          <button type="button" className="hc-result-act" title="加入对话" aria-label="加入对话" onClick={onAddToChat}>
            <Icon name="undo" size={16} />
          </button>
          <button type="button" className="hc-result-act" title="另存为素材" aria-label="另存为素材" onClick={onSaveMaterial}>
            <Icon name="save" size={16} />
          </button>
          <button type="button" className="hc-result-act" title="下载" aria-label="下载" onClick={onDownload}>
            <Icon name="download" size={16} />
          </button>
        </div>
        <button
          type="button"
          className="hc-result-close"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="hc-result-body">
        <div className="hc-result-stage">
          <div className="hc-result-frame">
            {cur.kind === "video" ? (
              <video className="hc-result-media" src={cur.src} controls playsInline />
            ) : (
              <button
                type="button"
                className="hc-result-media-btn"
                title="查看大图"
                aria-label="查看大图"
                onClick={() => onPreview?.(cur.src)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="hc-result-media" src={cur.src} alt="生成结果" />
              </button>
            )}
          </div>
        </div>
        {multi ? (
          <div className="hc-result-thumbs" role="listbox" aria-label="生成结果缩略图">
            {items.map((item, i) => (
              <button
                key={`${item.src}-${i}`}
                type="button"
                role="option"
                aria-selected={i === index}
                className={`hc-result-thumb${i === index ? " on" : ""}`}
                onClick={() => onIndex(i)}
                aria-label={`结果 ${i + 1}`}
              >
                {item.kind === "video" ? (
                  <video src={item.src} muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.src} alt="" />
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
