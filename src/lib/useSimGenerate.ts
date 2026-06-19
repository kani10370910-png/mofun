"use client";

import { useCallback, useRef, useState } from "react";

export interface SimState {
  open: boolean;
  stage: number; // 当前阶段索引
  pct: number; // 进度百分比
  stages: string[];
  done: boolean; // 完成闪现态
  title: string;
}

const IDLE: SimState = { open: false, stage: 0, pct: 0, stages: [], done: false, title: "" };

/** 模拟生成进度（image/video 用）：弹层 + 阶段推进 + 完成回调。还原原 demo runGenerate 的 setTimeout 流程。 */
export function useSimGenerate() {
  const [state, setState] = useState<SimState>(IDLE);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const close = useCallback(() => {
    clearTimers();
    setState(IDLE);
  }, []);

  /** 启动模拟生成。stages 为阶段列表，onFinish 在弹层关闭后回调（注入结果）。 */
  const run = useCallback((title: string, stages: string[], onFinish: () => void) => {
    clearTimers();
    const per = 100 / stages.length;
    setState({ open: true, stage: 0, pct: 0, stages, done: false, title });

    let step = 0;
    const advance = () => {
      if (step < stages.length) {
        const cur = step;
        setState((s) => ({ ...s, stage: cur, pct: Math.round(per * (cur + 0.4)) }));
        step++;
        timers.current.push(window.setTimeout(advance, 620));
      } else {
        setState((s) => ({ ...s, stage: stages.length, pct: 100 }));
        // 闪现完成态
        timers.current.push(
          window.setTimeout(() => {
            setState((s) => ({ ...s, done: true }));
            timers.current.push(
              window.setTimeout(() => {
                setState(IDLE);
                onFinish();
              }, 650)
            );
          }, 420)
        );
      }
    };
    timers.current.push(window.setTimeout(advance, 350));
  }, []);

  return { state, run, close };
}
