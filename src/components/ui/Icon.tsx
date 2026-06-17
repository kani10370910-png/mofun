import { ICON_PATHS, type IconName } from "@/data/icons";

/* 线性 SVG 图标组件（替代原 ICON(name,size) 字符串函数）
   path 内容是可信静态常量，用 dangerouslySetInnerHTML 注入，避免手改 90 个 SVG。*/
export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const p = ICON_PATHS[name] ?? ICON_PATHS.sparkle;
  return (
    <svg
      className={className ? `ico ${className}` : "ico"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: p }}
    />
  );
}
