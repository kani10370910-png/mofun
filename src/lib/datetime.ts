/* 生成时间戳工具：统一「YYYY-MM-DD HH:mm」格式（年月日时分） */

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 把日期格式化为「2026-06-16 14:30」 */
export function formatDateTime(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

/** 当前时刻的「年月日时分」字符串 */
export function nowStamp(): string {
  return formatDateTime(new Date());
}
