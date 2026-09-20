"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import {
  inviteShareText,
  inviteStats,
  loadInviteGift,
  type InviteGiftState,
} from "@/lib/inviteGift";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function InviteGiftPanel() {
  const toast = useToast();
  const { user } = useAuth();
  const [state, setState] = useState<InviteGiftState | null>(null);

  useEffect(() => {
    if (!user?.userId) {
      setState(null);
      return;
    }
    setState(loadInviteGift(user.userId));
  }, [user?.userId]);

  if (!user || !state) return null;
  const invite = state;

  const stats = inviteStats(invite);
  const shareText = inviteShareText(invite.code);
  const ambassador = stats.friends >= 1;

  async function copyShare() {
    const ok = await copyToClipboard(shareText);
    toast(ok ? "邀请文案和链接已复制" : "复制失败，请手动复制", ok ? undefined : "warn");
  }

  async function copyCode() {
    const ok = await copyToClipboard(invite.code);
    toast(ok ? "邀请码已复制" : "复制失败，请手动复制", ok ? undefined : "warn");
  }

  function viewEarnings() {
    if (stats.friends === 0) {
      toast("暂无收益可查看");
      return;
    }
    toast(`累计邀请 ${stats.friends} 人，获得 ${stats.points} 算力`);
  }

  return (
    <div className="am-panel am-panel-wide am-invite">
      <header className="am-invite-hero">
        <h1 className="am-invite-title">
          邀请好友，得 <em>现金奖励</em>，最高得 <em>10000</em> 算力！
        </h1>
        <p className="am-invite-sub">分享专属链接给好友，AI 创作效率翻 10 倍！</p>
      </header>

      <section className="am-invite-card">
        <pre className="am-invite-copy">{shareText}</pre>
        <button type="button" className="am-invite-copy-btn" onClick={() => void copyShare()}>
          <Icon name="copy" size={16} />
          一键复制邀请文案和链接
        </button>
        <div className="am-invite-code-row">
          <span>我的邀请码：</span>
          <code>{invite.code}</code>
          <button type="button" className="am-invite-code-btn" onClick={() => void copyCode()}>
            仅复制码
          </button>
        </div>
        <p className="am-invite-rules">
          <Icon name="info" size={14} />
          <span>
            奖励规则：1）新用户赠 66 算力（请注册后添加企微完成领取）；2）邀请好友即可解锁推广大使
            5% 出单奖励；3）邀请的好友激活后（至少创建一个项目）您还可领取系统随机算力奖励，次日发放。禁止任何形式的恶意刷单，违规者将面临封号及追究法律责任的处罚。活动解释权归魔方智绘所有。
          </span>
        </p>
      </section>

      <section className="am-invite-ambassador">
        <p>
          {ambassador ? (
            <>
              已解锁「推广大使」：享佣金 <em>5%</em> 起，推广越多收益越多。
            </>
          ) : (
            <>
              完成 <em>1</em> 人邀请即可解锁「推广大使」：享佣金 <em>5%</em> 起，推广越多收益越多。
            </>
          )}
        </p>
        <button type="button" className="am-invite-earn-btn" onClick={viewEarnings}>
          查看收益
        </button>
      </section>

      <div className="am-invite-stats">
        <article className="am-invite-stat">
          <div>
            <span>已邀请好友（人）</span>
            <strong>{stats.friends}</strong>
          </div>
          <span className="am-invite-stat-ico am-invite-stat-ico--green" aria-hidden>
            <Icon name="user" size={18} />
          </span>
        </article>
        <article className="am-invite-stat">
          <div>
            <span>累计获得算力（点）</span>
            <strong className={stats.points > 0 ? "is-hot" : ""}>{stats.points}</strong>
          </div>
          <span className="am-invite-stat-ico am-invite-stat-ico--orange" aria-hidden>
            <Icon name="bolt" size={18} />
          </span>
        </article>
      </div>

      <section className="am-invite-ledger">
        <h2>邀请记录</h2>
        <table>
          <thead>
            <tr>
              <th>受邀用户</th>
              <th>注册时间</th>
              <th>获得算力</th>
            </tr>
          </thead>
          <tbody>
            {invite.records.length === 0 ? (
              <tr>
                <td colSpan={3} className="am-invite-empty">
                  暂无邀请记录
                </td>
              </tr>
            ) : (
              invite.records.map((row) => (
                <tr key={row.id}>
                  <td>{row.userLabel}</td>
                  <td className="mono">{row.registeredAt}</td>
                  <td>{row.points}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
