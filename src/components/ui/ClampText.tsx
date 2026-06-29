"use client";

import { useEffect, useRef, useState } from "react";

/* 多行文字截断 + 点击展开：默认按 lines 行截断；内容超出时，点击文字即展开看全部，
   再次点击收回。仅当内容真正超出时才可点击（无「展开/收起」文字按钮）。 */
export function ClampText({
  text,
  lines = 2,
  className = "",
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);

  // 内容是否超过 lines 行（截断态下 scrollHeight > clientHeight 即溢出）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      // 仅在截断态测量才准；展开态保留上次结果
      if (!expanded) setOverflow(el.scrollHeight - el.clientHeight > 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines, expanded]);

  return (
    <span
      ref={ref}
      className={`clamp-text clamp-body ${expanded ? "" : "is-clamped"} ${className}`}
      style={
        expanded
          ? { cursor: "pointer" }
          : ({ ["--clamp-lines" as string]: lines, cursor: overflow ? "pointer" : "default" } as React.CSSProperties)
      }
      onClick={() => (expanded || overflow) && setExpanded((v) => !v)}
    >
      {text}
    </span>
  );
}
