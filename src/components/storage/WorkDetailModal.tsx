"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AssetCard, WorkBundleItem } from "@/lib/types";
import { asset } from "@/lib/asset";
import { displaySrc } from "@/lib/image";
import { primaryBundle } from "@/lib/workBundle";
import { workMetaFields } from "@/lib/workMeta";
import { resolveAssetPlayback } from "@/lib/videoCache";

export function WorkDetailModal({
  item,
  onClose,
  onReedit,
}: {
  item: AssetCard;
  onClose: () => void;
  onReedit?: () => void;
}) {
  const bundle = primaryBundle(item);
  const metaFields = workMetaFields(item);
  const [preview, setPreview] = useState<WorkBundleItem | null>(bundle[0] ?? null);
  const [zoom, setZoom] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let revoke: (() => void) | undefined;
    let cancelled = false;
    setPlayUrl(null);
    if (item.kind !== "视频" && !preview?.videoUrl && !preview?.mediaRef) return;
    const probe: AssetCard = preview?.videoUrl || preview?.mediaRef
      ? { ...item, videoUrl: preview.videoUrl, mediaRef: preview.mediaRef }
      : item;
    void (async () => {
      const res = await resolveAssetPlayback(probe);
      if (cancelled) {
        res?.revoke?.();
        return;
      }
      revoke = res?.revoke;
      setPlayUrl(res?.url ?? null);
    })();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [item, preview]);

  const previewImg = preview?.img;
  const isVideo = item.kind === "视频" || Boolean(preview?.videoUrl || preview?.mediaRef || playUrl);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="wd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wd-preview">
          {isVideo && playUrl ? (
            <video className="wd-preview-img" src={playUrl} controls playsInline />
          ) : previewImg ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="wd-preview-img" src={displaySrc(previewImg)} alt={preview?.label || item.name} />
              <button className="ipdl-zoom" aria-label="放大查看" onClick={() => setZoom(true)}>
                <Icon name="toolExpand" size={18} />
              </button>
            </>
          ) : (
            <span className="ipdl-preview-ph">{item.emoji}</span>
          )}
          <span className="ipdl-mark">{item.kind === "视频" ? "视频作品" : "由 AI 生成"}</span>
        </div>

        <div className="wd-info">
          <div className="ipdl-head">
            <div>
              <div className="ipdl-title">{item.name}</div>
              <div className="wd-sub">{item.sub}</div>
            </div>
            <button className="ipdl-close" aria-label="关闭" onClick={onClose}>
              <Icon name="close" size={22} />
            </button>
          </div>

          <div className="ipdl-scroll">
            {metaFields.length > 0 && (
              <div className="ipdl-group">
                <div className="ipdl-group-title">生成信息</div>
                <div className="wd-meta-list">
                  {metaFields.map((f) => (
                    <div key={f.label} className="wd-meta-row">
                      <div className="wd-meta-label">{f.label}</div>
                      <div className="wd-meta-value">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {item.text?.trim() && metaFields.length === 0 && (
              <div className="ipdl-field">
                <div className="ipdl-label">正文内容</div>
                <div className="wd-text">{item.text}</div>
              </div>
            )}

            {item.time && (
              <div className="ipdl-field">
                <div className="ipdl-label">生成时间</div>
                <div className="wd-meta">{item.time}</div>
              </div>
            )}

            {bundle.length > 0 && (
              <div className="ipdl-group">
                <div className="ipdl-group-title">
                  全部内容（{bundle.length}）
                </div>
                <div className="ipdl-result-grid">
                  {bundle.map((b) => (
                    <div
                      key={b.label}
                      className={`periph-cell${preview?.label === b.label ? " on" : ""}${!b.img && !b.videoUrl && !b.mediaRef ? " is-disabled" : ""}`}
                      onClick={() => setPreview(b)}
                      title={b.label}
                    >
                      {b.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={displaySrc(b.img)} alt={b.label} />
                      ) : (
                        <span className="periph-cell-ph">{item.kind === "视频" ? "" : ""}</span>
                      )}
                      <span className="periph-cell-tag">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="ipdl-foot">
            <div className="ipdl-foot-row">
              {onReedit && (
                <button className="btn btn-soft" type="button" onClick={onReedit}>
                  二次编辑
                </button>
              )}
              <button className="btn btn-primary" type="button" onClick={onClose}>
                关闭
              </button>
            </div>
          </div>
        </div>

        {zoom && previewImg && (
          <div className="img-zoom-mask" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
            <button className="img-zoom-close" aria-label="关闭" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
              <Icon name="close" size={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="img-zoom-img" src={asset(previewImg)} alt={preview?.label || item.name} onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    </div>
  );
}
