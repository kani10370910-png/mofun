"use client";

import { useCallback, useRef, useState } from "react";
import type { GenerateRequest } from "@/lib/types";

export interface StreamState {
  text: string;
  loading: boolean;
  error: string | null;
  done: boolean;
}

/** 一次性收集 /api/generate 的流式结果，返回完整文本（无 React 状态，供非 hook 场景调用）。
    出错或被中断返回空串，调用方据空串回退原始输入。signal 可选用于中断。 */
export async function collectGenerate(req: GenerateRequest, signal?: AbortSignal): Promise<string> {
  let full = "";
  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    const ctype = resp.headers.get("Content-Type") || "";
    if (!resp.ok || !resp.body || ctype.includes("application/json")) return "";
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const json = JSON.parse(data);
          if (json.error || json.done) continue;
          if (typeof json.text === "string") full += json.text;
        } catch {
          /* 跳过解析失败的帧 */
        }
      }
    }
  } catch {
    return "";
  }
  return full.trim();
}

/** 调 /api/generate 的流式 hook：逐块累加文本，支持中断 */
export function useGenerateStream() {
  const [state, setState] = useState<StreamState>({ text: "", loading: false, error: null, done: false });
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, loading: false }));
  }, []);

  /** 开始一次生成。onText 可选：每次增量回调（用于结构化场景另行累积）。
      返回 Promise<最终完整文本>。 */
  const generate = useCallback(
    async (req: GenerateRequest, onText?: (full: string) => void): Promise<string> => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState({ text: "", loading: true, error: null, done: false });

      let full = "";
      try {
        const resp = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
          signal: ctrl.signal,
        });

        // 非流式错误（JSON 错误体）
        const ctype = resp.headers.get("Content-Type") || "";
        if (!resp.ok || !resp.body || ctype.includes("application/json")) {
          let msg = `生成失败（${resp.status}）`;
          try {
            const j = await resp.json();
            if (j?.error) msg = j.error;
          } catch {
            /* ignore */
          }
          setState({ text: "", loading: false, error: msg, done: true });
          return "";
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              const json = JSON.parse(data);
              if (json.error) {
                setState((s) => ({ ...s, loading: false, error: json.error, done: true }));
                continue;
              }
              if (json.done) {
                continue;
              }
              if (typeof json.text === "string") {
                full += json.text;
                onText?.(full);
                setState((s) => ({ ...s, text: full }));
              }
            } catch {
              /* 跳过解析失败的帧 */
            }
          }
        }
        setState((s) => ({ ...s, loading: false, done: true }));
        return full;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setState((s) => ({ ...s, loading: false, done: true }));
          return full;
        }
        setState((s) => ({ ...s, loading: false, error: "网络错误，请重试。", done: true }));
        return full;
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ text: "", loading: false, error: null, done: false });
  }, []);

  return { state, generate, stop, reset };
}
