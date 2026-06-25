"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* 抠图蒙版画笔编辑器（路线 A：自动抠图后手动修整）。
   - 左：原图叠加蓝色蒙版预览（蒙版高亮 = 当前保留区）+ 画笔涂抹
   - 「增加选区」画笔把该处补回（蒙版置不透明）；「减少选区」擦掉（蒙版置透明）
   - 撤销 / 重做 / 重置（回到自动抠图初始蒙版）
   - 实时把「原图 × 蒙版」合成透明 PNG，通过 onResult 回传给父级显示在结果图区
   纯前端 canvas，无需任何 API。 */

type Mode = "add" | "sub";

/* 暴露给父级的工具控制（渲染在弹窗底栏的「增加选区/减少选区 + 撤销/重做/重置」） */
export interface BrushApi {
  mode: Mode;
  setMode: (m: Mode) => void;
  brush: number;
  setBrush: (n: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function MattingBrushEditor({
  imgSrc, // 同源可用的原图（blob: 或 /api/proxy-image?url=...）
  initialMaskCanvas, // 自动抠图得到的初始蒙版（alpha 已写入），可为空（全保留）
  onResult, // 合成的透明 PNG blob URL 变化时回调
  onApi, // 把工具控制（mode/undo/redo/reset…）暴露给父级（放进弹窗底栏）
}: {
  imgSrc: string;
  initialMaskCanvas?: HTMLCanvasElement | null;
  onResult: (url: string) => void;
  onApi?: (api: BrushApi) => void;
}) {
  const baseRef = useRef<HTMLImageElement | null>(null); // 原图
  const maskRef = useRef<HTMLCanvasElement | null>(null); // 蒙版（灰度，白=保留）
  const viewRef = useRef<HTMLCanvasElement | null>(null); // 显示用：原图 + 蓝色蒙版叠加
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [brush, setBrush] = useState(40);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // 历史栈（蒙版 ImageData 快照）
  const history = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const [, forceTick] = useState(0);
  const refresh = () => forceTick((n) => n + 1);

  // 初始化：加载原图，建立蒙版与显示 canvas
  useEffect(() => {
    let alive = true;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      if (!alive) return;
      baseRef.current = im;
      const w = im.naturalWidth, h = im.naturalHeight;
      const mask = document.createElement("canvas");
      mask.width = w; mask.height = h;
      const mctx = mask.getContext("2d")!;
      if (initialMaskCanvas) {
        // 用自动抠图的 alpha 作初始蒙版：alpha→灰度（白=保留）
        mctx.drawImage(initialMaskCanvas, 0, 0, w, h);
      } else {
        mctx.fillStyle = "#fff";
        mctx.fillRect(0, 0, w, h);
      }
      maskRef.current = mask;
      history.current = [mctx.getImageData(0, 0, w, h)];
      redo.current = [];
      setReady(true);
      renderView();
      emitResult();
    };
    im.onerror = () => alive && setReady(false);
    im.src = imgSrc;
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSrc]);

  // 把原图 + 蓝色蒙版叠加画到显示 canvas
  const renderView = useCallback(() => {
    const view = viewRef.current, base = baseRef.current, mask = maskRef.current;
    if (!view || !base || !mask) return;
    const w = base.naturalWidth, h = base.naturalHeight;
    view.width = w; view.height = h;
    const ctx = view.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base, 0, 0);
    // 蓝色半透明叠加在「保留区」上
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    tctx.fillStyle = "rgba(54,130,255,.38)";
    tctx.fillRect(0, 0, w, h);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(mask, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }, []);

  // 合成透明结果（原图 × 蒙版 alpha）→ blob URL
  const lastUrl = useRef<string>("");
  const emitResult = useCallback(() => {
    const base = baseRef.current, mask = maskRef.current;
    if (!base || !mask) return;
    const w = base.naturalWidth, h = base.naturalHeight;
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const octx = out.getContext("2d")!;
    octx.drawImage(base, 0, 0);
    octx.globalCompositeOperation = "destination-in";
    octx.drawImage(mask, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = URL.createObjectURL(blob);
      onResult(lastUrl.current);
    }, "image/png");
  }, [onResult]);

  // 画笔涂抹
  function paintAt(x: number, y: number) {
    const mask = maskRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d")!;
    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = mode === "add" ? "#fff" : "#000"; // 加=保留 减=透明
    mctx.beginPath();
    mctx.arc(x, y, brush, 0, Math.PI * 2);
    mctx.fill();
    if (last.current) {
      // 连成线，避免快速移动断点
      mctx.lineWidth = brush * 2;
      mctx.lineCap = "round";
      mctx.strokeStyle = mode === "add" ? "#fff" : "#000";
      mctx.beginPath();
      mctx.moveTo(last.current.x, last.current.y);
      mctx.lineTo(x, y);
      mctx.stroke();
    }
    last.current = { x, y };
    renderView();
  }

  // 把鼠标坐标换算到原图像素坐标
  function toImgCoord(e: React.PointerEvent) {
    const view = viewRef.current!, base = baseRef.current!;
    const rect = view.getBoundingClientRect();
    const sx = base.naturalWidth / rect.width;
    const sy = base.naturalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function onDown(e: React.PointerEvent) {
    if (!ready) return;
    drawing.current = true;
    last.current = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toImgCoord(e);
    paintAt(x, y);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const { x, y } = toImgCoord(e);
    paintAt(x, y);
  }
  function onUp() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    pushHistory();
    emitResult();
  }

  function pushHistory() {
    const mask = maskRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d")!;
    history.current.push(mctx.getImageData(0, 0, mask.width, mask.height));
    if (history.current.length > 30) history.current.shift();
    redo.current = [];
    refresh();
  }

  function restore(data: ImageData) {
    const mask = maskRef.current;
    if (!mask) return;
    mask.getContext("2d")!.putImageData(data, 0, 0);
    renderView();
    emitResult();
  }
  function undo() {
    if (history.current.length <= 1) return;
    const cur = history.current.pop()!;
    redo.current.push(cur);
    restore(history.current[history.current.length - 1]);
    refresh();
  }
  function doRedo() {
    if (redo.current.length === 0) return;
    const data = redo.current.pop()!;
    history.current.push(data);
    restore(data);
    refresh();
  }
  function reset() {
    if (history.current.length === 0) return;
    const first = history.current[0];
    history.current = [first];
    redo.current = [];
    restore(first);
    refresh();
  }

  // 把工具控制暴露给父级（弹窗底栏渲染）。只在 mode/brush/历史可用性变化时推送，避免死循环。
  const canUndo = history.current.length > 1;
  const canRedo = redo.current.length > 0;
  useEffect(() => {
    onApi?.({ mode, setMode, brush, setBrush, undo, redo: doRedo, reset, canUndo, canRedo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, brush, canUndo, canRedo]);

  return (
    <div className="brush-wrap">
      <canvas
        ref={viewRef}
        className="brush-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
    </div>
  );
}
