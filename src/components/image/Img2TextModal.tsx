"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/* 「图转文」弹窗：上传一张图（点击 / 拖拽 / ctrl+v 粘贴）→ 调 /api/vision 反推出
   适合文生图的画面描述词，点「转换成描述词」后通过 onResult 回填到描述框。
   纯前端 UI，视觉理解走现有 /api/vision（OpenAI 兼容多模态）。 */

// 反推画面描述词的提示词（面向文生图，区别于 IP 形象识别）
const T2I_VISION_PROMPT =
  "请把这张图转换成一段适合AI图像生成模型理解的中文画面描述词：" +
  "客观描述画面主体、场景环境、风格氛围、光影色调、构图与文字要点等可视化元素。" +
  "120字以内，只输出描述本身，不要标题、不要分点、不要换行。";

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("读取图片失败"));
    r.readAsDataURL(f);
  });
}

export function Img2TextModal({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const toast = useToast();
  const [img, setImg] = useState<string>(""); // data URL
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 仅客户端挂载后才 portal 到 body（避免 SSR 无 document）
  useEffect(() => setMounted(true), []);

  async function accept(f: File | null | undefined) {
    if (!f) return;
    if (!/^image\/(jpe?g|png)$/i.test(f.type)) {
      toast("仅支持 JPG / PNG 图片", "warn");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast("图片需小于 10M", "warn");
      return;
    }
    try {
      setImg(await fileToDataUrl(f));
    } catch {
      toast("读取图片失败", "warn");
    }
  }

  // 支持 ctrl+v 粘贴图片（弹窗打开期间全局监听）
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        accept(item.getAsFile());
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function convert() {
    if (!img || busy) return;
    setBusy(true);
    try {
      const resp = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img, prompt: T2I_VISION_PROMPT }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j?.text) {
        toast(j?.error || `转换失败（${resp.status}）`, "warn");
        return;
      }
      onResult(String(j.text).trim());
      toast("已转换成描述词，并填入画面描述");
      onClose();
    } catch {
      toast("网络错误，请重试", "warn");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="i2t-mask" onClick={onClose}>
      <div className="i2t-modal" onClick={(e) => e.stopPropagation()}>
        <div className="i2t-head">
          <div className="i2t-title">图转文</div>
          <button className="i2t-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div
          className={`i2t-drop ${dragOver ? "over" : ""} ${img ? "has-img" : ""}`}
          onClick={() => !img && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); accept(e.dataTransfer.files?.[0]); }}
        >
          {img ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="i2t-preview" src={img} alt="待转换图片" />
              <button
                className="i2t-rechoose"
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              >
                重新选择
              </button>
            </>
          ) : (
            <>
              <span className="i2t-plus"><Icon name="plus" size={22} /></span>
              <div className="i2t-main">点击 / 拖拽上传图片</div>
              <div className="i2t-main">使用 ctrl+v 粘贴</div>
              <div className="i2t-sub">支持 10M 内 JPG / PNG</div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }}
        />

        <div className="i2t-foot">
          <button
            className={`btn btn-primary i2t-go ${!img || busy ? "is-disabled" : ""}`}
            disabled={!img || busy}
            onClick={convert}
          >
            {busy ? (
              <span className="i2t-loading"><Icon name="refresh" size={15} className="ico-spin" /> 转换中…</span>
            ) : (
              "转换成描述词"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
