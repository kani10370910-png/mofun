"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/* 「图转文」面板：内嵌渲染在右侧结果区（与「帮我提案」同款交互，不再是居中弹窗）。
   上传一张图（点击 / 拖拽 / ctrl+v 粘贴）→ 调 /api/vision 反推出适合文生图的画面描述词，
   点「转换成描述词」后通过 onResult 回填到左侧描述框并关闭面板。 */

const T2I_VISION_PROMPT =
  "请像素级仔细观察这张图，把它【忠实地】转换成一段中文画面描述词，用于AI重新生成同款图。" +
  "请按以下顺序逐项核对后再写：" +
  "①头发的【真实颜色】（绿/蓝/棕/黑等，看准别猜错）与发型；" +
  "②服饰的款式（如汉服/连衣裙）与【每个部位的真实颜色】；" +
  "③双手【是否手持或佩戴物品】（如茶杯、篮子、道具），有就写明，没有才说空手；" +
  "④表情、姿态、整体画风（Q版卡通/写实/插画等）、背景配色。" +
  "【铁律】颜色和手持物必须与图完全一致，宁可不写也【绝不臆造或猜错颜色】，禁止添加图中没有的元素。" +
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
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // 支持 ctrl+v 粘贴图片
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

  // 点面板以外区域关闭（延后挂载，避免打开它的同一次点击立即关闭）
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
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

  return (
    <div className="propose-pane">
      <div className="propose-panel i2t-panel" ref={panelRef}>
        <div className="propose-head">
          <span className="propose-title">
            <Icon name="image" size={16} /> 图转文
          </span>
          <button className="bf-close" onClick={onClose} aria-label="关闭">
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
              <span className="i2t-plus"><Icon name="plus" size={20} /></span>
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

        <button
          className={`btn btn-block propose-go${!img && !busy ? " is-disabled" : ""}`}
          disabled={!img || busy}
          onClick={convert}
        >
          {busy ? (
            <span className="propose-loading"><Icon name="refresh" size={15} className="ico-spin" /> 转换中</span>
          ) : (
            "转换成描述词"
          )}
        </button>
      </div>
    </div>
  );
}
