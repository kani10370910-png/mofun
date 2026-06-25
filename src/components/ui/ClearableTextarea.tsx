"use client";

import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";

/* 带「清空」按钮的多行输入框：有内容时在右下角浮出清空按钮，点击清空。
   用法与原生 <textarea> 一致（value/onChange 照常传），额外传 onClear 负责清空。
   - wrapClassName：包裹层额外类名（需要在包裹层上叠加定位等样式时用）
   - clearLabel：清空按钮文案，默认「清空」
   - toolbar：可选，渲染在框内底部左侧的工具条（如「联想」「图转文」按钮）；
     此时底部一行常驻，左为工具条、右为清空按钮。
   样式见 globals.css 的 .ta-wrap / .ta-clear / .ta-bar。 */
type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  onClear: () => void;
  wrapClassName?: string;
  clearLabel?: string;
  toolbar?: ReactNode;
};

export const ClearableTextarea = forwardRef<HTMLTextAreaElement, Props>(function ClearableTextarea(
  { onClear, wrapClassName, clearLabel = "清空", toolbar, value, ...rest },
  ref,
) {
  const hasText = typeof value === "string" && value.trim().length > 0;

  // 有工具条时：底部常驻一行（左工具条、右清空），textarea 在上
  if (toolbar) {
    return (
      <div className={`ta-wrap ta-has-bar${wrapClassName ? ` ${wrapClassName}` : ""}`}>
        <textarea ref={ref} value={value} {...rest} />
        <div className="ta-bar">
          <div className="ta-bar-tools">{toolbar}</div>
          {hasText && (
            <button type="button" className="ta-bar-clear" onClick={onClear}>
              {clearLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

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
