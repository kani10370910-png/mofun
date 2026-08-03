"use client";

import { useRef } from "react";

/** 读取本地图片并压成正方形 JPEG dataURL，便于写入 localStorage */
export function readAvatarFile(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("图片请小于 8MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法处理图片"));
          return;
        }
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => reject(new Error("图片读取失败"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export function AvatarUpload({
  src,
  fallback,
  className,
  title = "点击上传头像",
  onUploaded,
  onError,
  rounded = "full",
}: {
  src?: string | null;
  fallback: string;
  className?: string;
  title?: string;
  onUploaded: (dataUrl: string) => void;
  onError?: (message: string) => void;
  rounded?: "full" | "md";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      className={`am-avatar-upload ${rounded === "md" ? "md" : "full"} ${className || ""}`}
      title={title}
      aria-label={title}
      onClick={() => inputRef.current?.click()}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span className="am-avatar-fallback">{fallback.slice(0, 1)}</span>
      )}
      <span className="am-avatar-hint" aria-hidden>
        换
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const url = await readAvatarFile(file);
            onUploaded(url);
          } catch (err) {
            onError?.(err instanceof Error ? err.message : "上传失败");
          }
        }}
      />
    </button>
  );
}
