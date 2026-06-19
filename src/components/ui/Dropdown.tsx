"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/data/icons";

export interface DropdownOption {
  name: string;
  desc?: string; // 模型描述 / 尺寸副值
  sub?: string; // 尺寸下拉的具体尺寸
  ico?: IconName; // 尺寸形状图标
  custom?: boolean; // 「自定义」项
}

/* 自定义下拉（模型/尺寸/比例共用），还原 .dropdown/.dd-* 结构与交互 */
export function Dropdown({
  title,
  triggerIcon,
  options,
  value,
  onChange,
  showSub,
}: {
  title: string;
  triggerIcon?: IconName;
  options: DropdownOption[];
  value: string;
  onChange: (opt: DropdownOption) => void;
  showSub?: boolean; // 触发器是否显示两行（名称 + 副尺寸）
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cur = options.find((o) => o.name === value) ?? options[0];

  return (
    <div className={`dropdown ${open ? "open" : ""}`} ref={ref}>
      <button className="dd-trigger" type="button" onClick={() => setOpen((v) => !v)}>
        <span className="dd-cur">
          {cur?.ico ? <Icon name={cur.ico} size={18} /> : triggerIcon ? <Icon name={triggerIcon} size={18} /> : null}
          {showSub ? (
            <span className="dd-cur-sz">
              <span className="dd-cur-name">{cur?.name}</span>
              {cur?.sub && <span className="dd-cur-sub">{cur.sub}</span>}
            </span>
          ) : (
            <span className="dd-cur-name">{cur?.name}</span>
          )}
        </span>
        <span className="dd-arrow">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <div className="dd-menu">
          <div className="dd-menu-title">{title}</div>
          {options.map((o) => (
            <div
              key={o.name}
              className={`dd-item ${o.sub !== undefined || o.ico ? "dd-item-sz" : ""} ${o.name === value ? "on" : ""}`}
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              {o.ico && (
                <span className="dd-sz-ico">
                  <Icon name={o.ico} size={20} />
                </span>
              )}
              <div className="dd-item-text">
                <div className="dd-name">{o.name}</div>
                {(o.desc || o.sub) && <div className="dd-desc">{o.desc ?? o.sub}</div>}
              </div>
              <span className="dd-check">
                <Icon name="check" size={16} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
