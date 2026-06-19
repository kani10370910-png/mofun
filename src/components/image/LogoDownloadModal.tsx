"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { makeZip } from "@/lib/zip";

type PackState = "idle" | "packing" | "done" | "error";

/* LOGO 下载弹窗：左侧预览 + 右侧三种格式说明 + 生成可编辑文件按钮 */
export function LogoDownloadModal({
  emoji,
  grad,
  img,
  onClose,
}: {
  emoji: string;
  grad: string;
  img?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pack, setPack] = useState<PackState>("idle");
  const timer = useRef<number | null>(null);

  // 点击「生成可编辑文件」：模拟打包用户文件（约 70% 成功，失败可重试）
  function startPack() {
    setPack("packing");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const ok = pack === "error" ? true : Math.random() > 0.25; // 重试必成功
      setPack(ok ? "done" : "error");
      if (!ok) toast("打包文件失败，请重新下载", "warn");
    }, 1600);
  }

  // 打包完成后点击：把 3 种格式打成 zip，真正触发浏览器下载到本地
  function downloadLocal() {
    const baseSvg = (bg: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${bg}"/>
  <text x="512" y="512" font-size="420" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  <text x="512" y="900" font-size="40" fill="#188772" text-anchor="middle" font-family="sans-serif">由 魔方智绘 生成</text>
</svg>`;
    try {
      const blob = makeZip([
        { name: "logo-高清.png.svg", content: baseSvg("#ffffff") },
        { name: "logo-透明背景.png.svg", content: baseSvg("none") },
        { name: "logo-矢量.svg", content: baseSvg("#ffffff") },
        { name: "说明.txt", content: "魔方智绘 · LOGO 可编辑文件包\r\n包含：高清 PNG / 透明背景 PNG / 矢量 SVG\r\n（演示文件，实际由 AI 生成）" },
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mofun-logo.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("已下载压缩包到本地");
    } catch {
      toast("下载失败，请重试", "warn");
      return;
    }
    onClose();
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="dl-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dl-head">
          <div className="dl-title">LOGO 下载</div>
          <button className="bf-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="dl-body">
          {/* 左：预览 */}
          <div className={`dl-preview ${img ? "" : grad}`}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="dl-preview-img" src={img} alt="LOGO 预览" />
            ) : (
              <span className="dl-preview-emoji">{emoji}</span>
            )}
          </div>

          {/* 右：说明 + 格式明细 + 按钮 */}
          <div className="dl-info">
            <h3 className="dl-info-title">点击下方按钮生成可编辑文件</h3>
            <div className="dl-divider" />
            <div className="dl-formats-label">文件明细：</div>
            <div className="dl-formats">
              <div className="dl-format">
                <span className="dl-fmt-ico dl-fmt-png">PNG</span>
                <div className="dl-fmt-text">
                  <div className="dl-fmt-name">高清 PNG 格式</div>
                  <div className="dl-fmt-desc">可用于微信 / 网店等图片</div>
                </div>
              </div>
              <div className="dl-format">
                <span className="dl-fmt-ico dl-fmt-alpha">PNG</span>
                <div className="dl-fmt-text">
                  <div className="dl-fmt-name">透明背景 PNG 格式</div>
                  <div className="dl-fmt-desc">背景透明的图片格式</div>
                </div>
              </div>
              <div className="dl-format">
                <span className="dl-fmt-ico dl-fmt-svg">SVG</span>
                <div className="dl-fmt-text">
                  <div className="dl-fmt-name">矢量可编辑 SVG 格式</div>
                  <div className="dl-fmt-desc">可印刷并任意调整的矢量格式，即源文件</div>
                </div>
              </div>
            </div>
            <div className="dl-actions">
              {pack === "idle" && (
                <button className="btn btn-primary" onClick={startPack}>
                  <Icon name="sparkle" size={15} /> 生成可编辑文件 <span className="btn-credit">12 算力</span>
                </button>
              )}
              {pack === "packing" && (
                <button className="btn btn-primary" disabled>
                  <span className="dl-spinner" /> 正在打包文件
                </button>
              )}
              {pack === "done" && (
                <button className="btn btn-primary" onClick={downloadLocal}>
                  <Icon name="download" size={15} /> 下载到本地
                </button>
              )}
              {pack === "error" && (
                <button className="btn btn-primary dl-retry" onClick={startPack}>
                  <Icon name="refresh" size={15} /> 重新下载文件
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
