"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/data/icons";
import { loopStepOn } from "@/lib/harness/opsConfig";
import type { SandboxTraceItem } from "@/lib/harness/sandboxTrace";

const KIND_ICON: Record<SandboxTraceItem["kind"], IconName> = {
  think: "comment",
  read: "content",
  web: "search",
  review: "eye",
  optimize: "refresh",
  generate: "image",
  reply: "check",
};

export function SandboxTrace({
  items,
  live = false,
}: {
  items: SandboxTraceItem[];
  live?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!live || expanded) return;
    const box = viewportRef.current;
    const end = endRef.current;
    if (!box || !end) return;
    box.scrollTop = Math.max(0, end.offsetTop - box.clientHeight + end.offsetHeight);
  }, [items, live, expanded]);

  const shown = items.filter((it) => it.kind !== "reply");
  if (!loopStepOn("sandboxTrace") || !shown.length) return null;

  return (
    <div className={`hc-sandbox-card${live ? " is-live" : ""}${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="hc-sandbox-hd"
        aria-expanded={expanded}
        aria-label={expanded ? "收起深度思考" : "展开查看全部深度思考"}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="hc-sandbox-hd-title">深度思考</span>
        <Icon name="chevron" size={14} className="hc-sandbox-chevron" />
      </button>
      <div ref={viewportRef} className="hc-sandbox-viewport">
        <ol className="hc-sandbox" aria-label="深度思考">
          {shown.map((it, i) => (
            <li
              key={it.id}
              ref={i === shown.length - 1 ? endRef : undefined}
              className={`hc-sandbox-item is-${it.status}`}
            >
              <span className="hc-sandbox-ico" aria-hidden="true">
                {it.kind === "reply" ? (
                  <span className="hc-sandbox-check">
                    <Icon name="check" size={12} />
                  </span>
                ) : (
                  <Icon name={KIND_ICON[it.kind]} size={14} />
                )}
              </span>
              <span className="hc-sandbox-label">
                <span className="hc-sandbox-label-t">{it.label}</span>
                {it.detail ? <span className="hc-sandbox-detail">{it.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
