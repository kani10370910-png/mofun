"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";

/* 带「清空」按钮的多行输入框：有内容时在右下角浮出清空按钮，点击清空。
   用法与原生 <textarea> 一致（value/onChange 照常传），额外传 onClear 负责清空。
   - wrapClassName：包裹层额外类名（需要在包裹层上叠加定位等样式时用）
   - clearLabel：清空按钮文案，默认「清空」
   样式见 globals.css 的 .ta-wrap / .ta-clear。 */
type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  onClear: () => void;
  wrapClassName?: string;
  clearLabel?: string;
};

export const ClearableTextarea = forwardRef<HTMLTextAreaElement, Props>(function ClearableTextarea(
  { onClear, wrapClassName, clearLabel = "清空", value, ...rest },
  ref,
) {
  const hasText = typeof value === "string" && value.trim().length > 0;
  return (
    <div className={`ta-wrap${wrapClassName ? ` ${wrapClassName}` : ""}`}>
      <textarea ref={ref} value={value} {...rest} />
      {hasText && (
        <button type="button" className="ta-clear" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
});
