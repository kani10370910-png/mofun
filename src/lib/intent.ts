import { intentRules } from "@/data/home";
import type { IntentRule } from "@/lib/types";

/* 意图识别：按关键词匹配，命中即返回对应规则（演示用，与原 demo 一致） */
export function matchIntent(text: string): IntentRule | null {
  const t = (text || "").toLowerCase();
  for (const rule of intentRules) {
    if (rule.kw.some((k) => t.includes(k.toLowerCase()))) {
      return rule;
    }
  }
  return null;
}
