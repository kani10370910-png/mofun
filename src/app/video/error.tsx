"use client";

export default function VideoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page" style={{ minHeight: "40vh", display: "grid", placeItems: "center", gap: 12, padding: 32 }}>
      <p style={{ margin: 0, fontSize: 15 }}>页面打开失败{error?.message ? `：${error.message}` : ""}</p>
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => reset()}>
          再试一次
        </button>
        <a className="btn btn-ghost btn-sm" href="/video?sub=studio">
          返回制作大片
        </a>
      </div>
    </div>
  );
}
