"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AssetCard } from "@/lib/types";

export type DateRange = "all" | "today" | "7d" | "30d";

const DATE_OPTS: { key: DateRange; name: string }[] = [
  { key: "all", name: "全部时间" },
  { key: "today", name: "今天" },
  { key: "7d", name: "近 7 天" },
  { key: "30d", name: "近 30 天" },
];

// 解析「YYYY-MM-DD HH:mm」→ 时间戳（毫秒）；无 time 返回 null
function parseTime(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
}

/** 按名称关键词 + 日期范围 + 收藏 筛选作品/素材 */
export function useAssetFilter(items: AssetCard[], isFav?: (it: AssetCard) => boolean) {
  const [kw, setKw] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [day, setDay] = useState(""); // 具体某天 yyyy-mm-dd（优先于 range）
  const [favOnly, setFavOnly] = useState(false);

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    const now = Date.now();
    const spanMs = range === "today" ? 0 : range === "7d" ? 7 * 864e5 : range === "30d" ? 30 * 864e5 : -1;

    return items.filter((it) => {
      // 只看收藏
      if (favOnly && isFav && !isFav(it)) return false;
      // 名称 / 来源关键词
      if (k && !`${it.name} ${it.sub} ${it.kind}`.toLowerCase().includes(k)) return false;
      const ts = parseTime(it.time);
      // 具体某天优先
      if (day) {
        if (!it.time || !it.time.startsWith(day)) return false;
        return true;
      }
      // 日期范围
      if (range !== "all") {
        if (ts == null) return false;
        if (range === "today") {
          const d0 = new Date();
          d0.setHours(0, 0, 0, 0);
          if (ts < d0.getTime()) return false;
        } else if (now - ts > spanMs) {
          return false;
        }
      }
      return true;
    });
  }, [items, kw, range, day, favOnly, isFav]);

  return { kw, setKw, range, setRange, day, setDay, favOnly, setFavOnly, filtered };
}

export function AssetFilterBar({
  kw,
  setKw,
  range,
  setRange,
  day,
  setDay,
  favOnly,
  setFavOnly,
  total,
  shown,
}: {
  kw: string;
  setKw: (v: string) => void;
  range: DateRange;
  setRange: (v: DateRange) => void;
  day: string;
  setDay: (v: string) => void;
  favOnly: boolean;
  setFavOnly: (v: boolean) => void;
  total: number;
  shown: number;
}) {
  return (
    <div className="asset-filter">
      <div className="af-search">
        <Icon name="search" size={16} />
        <input
          type="text"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="按名称搜索…"
        />
        {kw && (
          <button className="af-clear" onClick={() => setKw("")} aria-label="清空">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className="af-ranges">
        {DATE_OPTS.map((o) => (
          <button
            key={o.key}
            className={range === o.key && !day ? "af-range on" : "af-range"}
            onClick={() => {
              setRange(o.key);
              setDay("");
            }}
          >
            {o.name}
          </button>
        ))}
      </div>

      <label className="af-date">
        <Icon name="content" size={15} />
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>

      <button className={favOnly ? "af-fav on" : "af-fav"} onClick={() => setFavOnly(!favOnly)}>
        <Icon name="heart" size={15} /> 只看收藏
      </button>

      {(kw || range !== "all" || day || favOnly) && (
        <span className="af-count">
          {shown} / {total}
          <button
            className="af-reset"
            onClick={() => {
              setKw("");
              setRange("all");
              setDay("");
              setFavOnly(false);
            }}
          >
            重置
          </button>
        </span>
      )}
    </div>
  );
}
