/** 操作按钮上的积分消耗角标；amount≤0 不展示（文本生成等免费能力） */
export function PointsCost({
  amount,
  perTime,
  className = "btn-credit",
}: {
  amount: number;
  perTime?: boolean;
  className?: string;
}) {
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return null;
  return (
    <span className={className}>
      {n}算力{perTime ? "/次" : ""}
    </span>
  );
}
