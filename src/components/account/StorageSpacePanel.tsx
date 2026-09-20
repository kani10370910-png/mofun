"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { identityScopeKey } from "@/lib/identity";
import {
  formatGb,
  formatUsed,
  loadCloudSpace,
  pointsForGb,
  purchaseCloudSpace,
  remainGb,
  SPACE_PACK_GBS,
  SPACE_VALID_NOTE,
  totalGb,
  type CloudSpace,
} from "@/lib/cloudSpace";
import { beginGenerateCharge, chargeAuthPatch, markGenerateDispatched, settleGenerateCharge } from "@/lib/chargeGenerate";

export function StorageSpacePanel() {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [space, setSpace] = useState<CloudSpace | null>(null);
  const [customGb, setCustomGb] = useState("1");

  useEffect(() => {
    if (!user?.userId) {
      setSpace(null);
      return;
    }
    setSpace(loadCloudSpace(identityScopeKey(user)));
  }, [user?.userId, user?.companyId, user?.joinedOrg, user?.enterpriseVerified]);

  if (!user || !space) return null;
  const account = user;

  const customN = Math.floor(Number(customGb) || 0);
  const customOk = customN >= 1 && customN <= 9999;

  function buy(gb: number) {
    const pts = pointsForGb(gb);
    const charged = beginGenerateCharge(account, pts, `购买存储空间 ${gb} GB`);
    if (!charged.ok) {
      toast(charged.message, "warn");
      return;
    }
    const current = loadCloudSpace(identityScopeKey(account));
    const res = purchaseCloudSpace(current, gb);
    if (!res.ok) {
      settleGenerateCharge(charged.charge);
      toast(res.message, "warn");
      return;
    }
    markGenerateDispatched(charged.charge);
    setSpace(res.space);
    updateUser(chargeAuthPatch(charged.charge.wallet, account));
    toast(`已购买 ${gb} GB，消耗 ${pts} 算力`);
  }

  return (
    <div className="am-panel am-panel-wide am-space">
      <h1 className="am-title">存储空间</h1>

      <section className="am-space-usage" aria-label="存储用量">
        <div className="am-space-usage-col">
          <div className="am-space-usage-row">
            <span>会员赠送</span>
            <b>{formatGb(space.giftGb)}</b>
          </div>
          <div className="am-space-usage-row">
            <span>已使用</span>
            <b>{formatUsed(space)}</b>
          </div>
          {space.purchasedGb > 0 ? (
            <div className="am-space-usage-row">
              <span>加购空间</span>
              <b>{formatGb(space.purchasedGb)}</b>
            </div>
          ) : (
            <div className="am-space-usage-row">
              <span>会员赠送</span>
              <b>{formatGb(space.giftGb)}</b>
            </div>
          )}
        </div>
        <div className="am-space-usage-col am-space-usage-col--right">
          <div className="am-space-usage-row">
            <span>总容量</span>
            <b>{formatGb(totalGb(space))}</b>
          </div>
          <div className="am-space-usage-row">
            <span>剩余</span>
            <b>{formatGb(remainGb(space))}</b>
          </div>
        </div>
      </section>

      <div className="am-space-packs">
        {SPACE_PACK_GBS.map((gb) => (
          <article key={gb} className="am-space-pack">
            <div className="am-space-pack-ico" aria-hidden>
              <Icon name="storage" size={22} />
            </div>
            <h3>{gb} GB</h3>
            <p>
              <Icon name="bolt" size={14} />
              <span>消耗 {pointsForGb(gb)} 算力</span>
            </p>
            <p>
              <Icon name="clock" size={14} />
              <span>{SPACE_VALID_NOTE}</span>
            </p>
            <button type="button" className="am-space-pack-btn" onClick={() => buy(gb)}>
              立即购买
            </button>
          </article>
        ))}

        <article className="am-space-pack am-space-pack--custom">
          <div className="am-space-pack-ico" aria-hidden>
            <Icon name="pencil" size={22} />
          </div>
          <h3>自定义</h3>
          <label className="am-space-custom">
            <span>最小 1 GB</span>
            <input
              type="number"
              min={1}
              max={9999}
              step={1}
              value={customGb}
              onChange={(e) => setCustomGb(e.target.value)}
              aria-label="自定义容量 GB"
            />
            <em>GB</em>
          </label>
          <p>
            <Icon name="bolt" size={14} />
            <span>消耗 {customOk ? pointsForGb(customN) : "—"} 算力</span>
          </p>
          <p>
            <Icon name="clock" size={14} />
            <span>{SPACE_VALID_NOTE}</span>
          </p>
          <button
            type="button"
            className="am-space-pack-btn"
            disabled={!customOk}
            onClick={() => buy(customN)}
          >
            立即购买
          </button>
        </article>
      </div>
    </div>
  );
}
