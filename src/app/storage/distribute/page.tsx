"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/AuthContext";
import { getRegionPack } from "@/data/regionAssets";
import {
  getChildren,
  listOuOptions,
  loadOrgStore,
  resolveOuRegionId,
  type OrgStore,
} from "@/lib/org";

type AssetType = "平台素材" | "组织素材" | "个人素材";
type GrantLevel = "市级" | "区县" | "乡镇" | "个人";

type GrantRow = {
  id: string;
  assetName: string;
  assetType: AssetType;
  from: GrantLevel;
  to: GrantLevel;
  /** 真实组织目标 */
  orgId?: string;
  targetOuId?: string;
  targetOuName?: string;
  rights: string[];
  expires: string;
  status: "生效中" | "待审核" | "已过期";
};

type RightsKey = "查看" | "使用" | "下载" | "管理" | "转授权";

function grantStatusClass(status: GrantRow["status"]): string {
  if (status === "生效中") return "active";
  if (status === "待审核") return "pending";
  return "expired";
}
type RecycleRow = {
  id: string;
  grantId: string;
  assetName: string;
  operator: string;
  reason: string;
  time: string;
};
type AuditRow = {
  id: string;
  action: string;
  target: string;
  operator: string;
  detail: string;
  time: string;
};

const SAMPLE_ROWS: GrantRow[] = [
  { id: "g-101", assetName: "农业文旅主视觉规范", assetType: "平台素材", from: "市级", to: "区县", rights: ["查看", "使用", "下载", "转授权"], expires: "2026-12-31", status: "生效中" },
  { id: "g-102", assetName: "稻田音乐节海报套版", assetType: "组织素材", from: "区县", to: "乡镇", rights: ["查看", "使用", "下载"], expires: "2026-10-01", status: "生效中" },
  { id: "g-103", assetName: "品牌 IP 吉祥物表情包", assetType: "组织素材", from: "区县", to: "个人", rights: ["查看", "使用"], expires: "2026-09-15", status: "待审核" },
  { id: "g-104", assetName: "乡村打卡路线短视频模板", assetType: "个人素材", from: "个人", to: "乡镇", rights: ["查看", "使用"], expires: "2026-07-10", status: "已过期" },
];

const PACKAGE_CARDS = [
  {
    title: "品牌基础包",
    assets: ["Logo 标准稿", "标准色与辅助色", "字体与排版规范", "主视觉 KV 模板"],
    owner: "市级平台",
    to: "区县 / 乡镇",
  },
  {
    title: "活动传播包",
    assets: ["活动海报模板", "短视频封面模板", "社媒文案参考", "活动图标与贴纸"],
    owner: "区县品牌中心",
    to: "乡镇 / 个人",
  },
  {
    title: "创作素材包",
    assets: ["IP 形象物料", "导视元素", "农业场景图库", "电商主图模板"],
    owner: "乡镇运营端",
    to: "个人创作者",
  },
] as const;

const RIGHTS_MATRIX: Array<{ role: string; view: string; use: string; download: string; manage: string; regrant: string }> = [
  { role: "市级平台", view: "全部", use: "全部", download: "全部", manage: "全部", regrant: "全部" },
  { role: "区县品牌中心", view: "平台+本级", use: "平台+本级", download: "按策略", manage: "本级", regrant: "经审批" },
  { role: "乡镇运营端", view: "上级授权", use: "上级授权", download: "按策略", manage: "本级", regrant: "否" },
  { role: "个人创作者", view: "授权范围", use: "授权范围", download: "按策略", manage: "否", regrant: "否" },
];

const FLOW_STEPS = [
  "1. 选资产：从平台/组织/个人资产池选择资产包或单资产",
  "2. 设范围：选择目标组织与账号层级，支持批量下发",
  "3. 配权限：配置查看/使用/下载/管理/转授权能力",
  "4. 定期限：设置生效时间、失效时间与自动回收策略",
  "5. 审批下发：触发审批流，审批通过后自动写入授权记录",
  "6. 审计回溯：全程记录谁在什么时间做了什么变更",
] as const;

const RIGHTS_ALL: RightsKey[] = ["查看", "使用", "下载", "管理", "转授权"];

export default function AssetDistributePage() {
  const { user } = useAuth();
  const [orgStore, setOrgStore] = useState<OrgStore | null>(null);
  const [rowsState, setRowsState] = useState<GrantRow[]>(SAMPLE_ROWS);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<GrantLevel | "全部">("全部");
  const [status, setStatus] = useState<GrantRow["status"] | "全部">("全部");
  const [activeTab, setActiveTab] = useState<"grant" | "recycle" | "audit">("grant");
  const [showCreate, setShowCreate] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("平台素材");
  const [fromLevel, setFromLevel] = useState<GrantLevel>("市级");
  const [toLevel, setToLevel] = useState<GrantLevel>("区县");
  const [targetOuId, setTargetOuId] = useState("");
  const [rights, setRights] = useState<RightsKey[]>(["查看", "使用"]);
  const [expires, setExpires] = useState("2026-12-31");
  const [approveRequired, setApproveRequired] = useState(true);
  const [recycles, setRecycles] = useState<RecycleRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([
    { id: "a-001", action: "创建下发", target: "g-101", operator: "市级管理员", detail: "农业文旅主视觉规范 -> 区县", time: "2026-08-06 17:20" },
    { id: "a-002", action: "审批通过", target: "g-103", operator: "区县审核员", detail: "品牌 IP 吉祥物表情包授权生效", time: "2026-08-06 17:25" },
  ]);

  useEffect(() => {
    const store = loadOrgStore(user);
    setOrgStore(store);
    const firstLeaf =
      store.units.find((u) => u.regionId === "anji")?.id ||
      store.units.find((u) => u.id !== store.organization.rootOuId)?.id ||
      "";
    setTargetOuId(firstLeaf);
  }, [user]);

  const ouOptions = useMemo(() => (orgStore ? listOuOptions(orgStore) : []), [orgStore]);

  const orgCards = useMemo(() => {
    if (!orgStore) return [];
    const root = orgStore.units.find((u) => u.id === orgStore.organization.rootOuId);
    if (!root) return [];
    const city = getChildren(orgStore, root.id)[0];
    const counties = city ? getChildren(orgStore, city.id) : [];
    const towns = counties.flatMap((c) => getChildren(orgStore, c.id));
    return [
      { name: city?.name || "市级平台", tip: "平台中枢" },
      { name: counties[0]?.name || "区县", tip: counties.map((c) => c.name).join(" / ") || "区县节点" },
      { name: towns[0]?.name || "乡镇", tip: "乡镇运营" },
      { name: "个人创作者", tip: "账号叶子" },
    ];
  }, [orgStore]);

  const rows = useMemo(() => {
    return rowsState.filter((r) => {
      if (level !== "全部" && r.to !== level) return false;
      if (status !== "全部" && r.status !== status) return false;
      if (!query.trim()) return true;
      const q = query.trim();
      return r.assetName.includes(q) || r.id.includes(q) || (r.targetOuName || "").includes(q);
    });
  }, [level, query, rowsState, status]);

  function toggleRight(k: RightsKey) {
    setRights((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function nowText() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function createGrant() {
    const name = assetName.trim();
    if (!name) return;
    const nextNo = rowsState.length + 101;
    const id = `g-${nextNo}`;
    const ou = orgStore?.units.find((u) => u.id === targetOuId);
    const regionName = orgStore && ou ? getRegionPack(resolveOuRegionId(orgStore, ou.id)).regionName : "";
    const row: GrantRow = {
      id,
      assetName: name,
      assetType,
      from: fromLevel,
      to: toLevel,
      orgId: orgStore?.organization.id,
      targetOuId: ou?.id,
      targetOuName: ou?.name,
      rights: rights.length ? rights : ["查看"],
      expires,
      status: approveRequired ? "待审核" : "生效中",
    };
    setRowsState((prev) => [row, ...prev]);
    setAudits((prev) => [
      {
        id: `a-${prev.length + 101}`,
        action: "创建下发",
        target: id,
        operator: "当前用户",
        detail: `${name} -> ${ou?.name || toLevel}${regionName ? `（本地增强·${regionName}）` : ""} (${approveRequired ? "待审核" : "生效中"})`,
        time: nowText(),
      },
      ...prev,
    ]);
    setShowCreate(false);
    setAssetName("");
    setRights(["查看", "使用"]);
    setApproveRequired(true);
    setActiveTab("grant");
  }

  function recycleGrant(row: GrantRow) {
    setRowsState((prev) => prev.map((it) => (it.id === row.id ? { ...it, status: "已过期" } : it)));
    const recycle: RecycleRow = {
      id: `r-${recycles.length + 1}`,
      grantId: row.id,
      assetName: row.assetName,
      operator: "当前用户",
      reason: "手动回收授权",
      time: nowText(),
    };
    setRecycles((prev) => [recycle, ...prev]);
    setAudits((prev) => [
      {
        id: `a-${prev.length + 101}`,
        action: "回收授权",
        target: row.id,
        operator: "当前用户",
        detail: `${row.assetName} 已回收`,
        time: recycle.time,
      },
      ...prev,
    ]);
  }

  return (
    <div className="page">
      <div className="storage-page asset-distribute-page">
        <div className="st-topbar">
          <div className="st-title-wrap">
            <h2 className="st-title">下发资产</h2>
            <p className="st-sub">按“平台-组织-个人”分层授权，统一管控品牌资产下发、回收和审计。</p>
          </div>
          <div className="st-top-actions">
            <Link href="/storage?tab=brand" className="btn btn-ghost btn-sm">
              <Icon name="chevron" size={15} /> 返回品牌资产
            </Link>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={15} /> 新建下发任务
            </button>
          </div>
        </div>

        <section className="ad-section">
          <div className="ad-head">
            <h3>组织层级</h3>
            <Link href="/account?tab=members" className="tag">
              管理成员
            </Link>
          </div>
          <div className="ad-org-grid">
            {(orgCards.length
              ? orgCards
              : [
                  { name: "市级平台", tip: "平台中枢" },
                  { name: "区县品牌中心", tip: "区县节点" },
                  { name: "乡镇运营端", tip: "乡镇运营" },
                  { name: "个人创作者", tip: "账号叶子" },
                ]
            ).map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="ad-org-card">
                <div className="ad-org-step">{idx + 1}</div>
                <div className="ad-org-name">{item.name}</div>
                <div className="ad-org-tip">{item.tip}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="ad-section">
          <div className="ad-head">
            <h3>资产包内容</h3>
            <span className="tag">按包下发</span>
          </div>
          <div className="ad-package-grid">
            {PACKAGE_CARDS.map((pkg) => (
              <article key={pkg.title} className="ad-package-card">
                <div className="ad-package-top">
                  <h4>{pkg.title}</h4>
                  <span className="ad-mini-tag">{pkg.owner} 发起</span>
                </div>
                <ul className="ad-bullets">
                  {pkg.assets.map((asset) => (
                    <li key={asset}>{asset}</li>
                  ))}
                </ul>
                <div className="ad-package-foot">可下发至：{pkg.to}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="ad-section">
          <div className="ad-head">
            <h3>权限矩阵</h3>
            <span className="tag">零遗漏控制</span>
          </div>
          <div className="ad-table-wrap">
            <table className="ad-table ad-table-compact">
              <thead>
                <tr>
                  <th>角色</th>
                  <th>查看</th>
                  <th>使用</th>
                  <th>下载</th>
                  <th>管理</th>
                  <th>转授权</th>
                </tr>
              </thead>
              <tbody>
                {RIGHTS_MATRIX.map((r) => (
                  <tr key={r.role}>
                    <td>{r.role}</td>
                    <td>{r.view}</td>
                    <td>{r.use}</td>
                    <td>{r.download}</td>
                    <td>{r.manage}</td>
                    <td>{r.regrant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ad-section">
          <div className="ad-head">
            <h3>下发流程</h3>
            <span className="tag">审批 + 回收</span>
          </div>
          <div className="ad-flow">
            {FLOW_STEPS.map((step) => (
              <div key={step} className="ad-flow-item">
                <Icon name="check" size={14} />
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="ad-governance">
            <div className="ad-governance-item">
              <Icon name="shield" size={16} />
              <div>
                <strong>统一治理</strong>
                <p>禁止跨层级越权下发，策略变更需审批并全量留痕。</p>
              </div>
            </div>
            <div className="ad-governance-item">
              <Icon name="history" size={16} />
              <div>
                <strong>可追溯审计</strong>
                <p>支持按资产、账号、组织查看授权历史和回收记录。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="ad-section">
          <div className="ad-head">
            <h3>资产任务中心</h3>
            <span className="tag">业务数据流转</span>
          </div>
          <div className="ad-tabs">
            <button className={`ad-tab ${activeTab === "grant" ? "on" : ""}`} onClick={() => setActiveTab("grant")}>下发清单</button>
            <button className={`ad-tab ${activeTab === "recycle" ? "on" : ""}`} onClick={() => setActiveTab("recycle")}>回收记录</button>
            <button className={`ad-tab ${activeTab === "audit" ? "on" : ""}`} onClick={() => setActiveTab("audit")}>审计日志</button>
          </div>

          {activeTab === "grant" && (
            <>
              <div className="ad-head" style={{ marginTop: 10 }}>
                <h3>下发清单</h3>
                <span className="tag">{rows.length} 条记录</span>
              </div>
              <div className="ad-filters">
                <input className="ad-input" placeholder="搜索资产名或任务编号" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select className="ad-select" value={level} onChange={(e) => setLevel(e.target.value as GrantLevel | "全部")}>
                  <option value="全部">目标层级：全部</option>
                  <option value="市级">目标层级：市级</option>
                  <option value="区县">目标层级：区县</option>
                  <option value="乡镇">目标层级：乡镇</option>
                  <option value="个人">目标层级：个人</option>
                </select>
                <select className="ad-select" value={status} onChange={(e) => setStatus(e.target.value as GrantRow["status"] | "全部")}>
                  <option value="全部">状态：全部</option>
                  <option value="生效中">状态：生效中</option>
                  <option value="待审核">状态：待审核</option>
                  <option value="已过期">状态：已过期</option>
                </select>
              </div>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>任务编号</th>
                      <th>资产</th>
                      <th>类型</th>
                      <th>下发路径</th>
                      <th>权限</th>
                      <th>有效期</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.assetName}</td>
                        <td>{r.assetType}</td>
                        <td>
                          {r.targetOuName
                            ? `${r.from} → ${r.targetOuName}`
                            : `${r.from} → ${r.to}`}
                        </td>
                        <td>{r.rights.join(" / ")}</td>
                        <td>{r.expires}</td>
                        <td><span className={`ad-status ad-status-${grantStatusClass(r.status)}`}>{r.status}</span></td>
                        <td>
                          <div className="ad-row-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab("audit")}>日志</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => recycleGrant(r)} disabled={r.status === "已过期"}>回收</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === "recycle" && (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>回收编号</th>
                    <th>任务编号</th>
                    <th>资产</th>
                    <th>操作人</th>
                    <th>原因</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recycles.length === 0 && (
                    <tr><td colSpan={6} className="ad-empty-cell">暂无回收记录</td></tr>
                  )}
                  {recycles.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.grantId}</td>
                      <td>{r.assetName}</td>
                      <td>{r.operator}</td>
                      <td>{r.reason}</td>
                      <td>{r.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "audit" && (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>日志编号</th>
                    <th>动作</th>
                    <th>目标</th>
                    <th>操作人</th>
                    <th>详情</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => (
                    <tr key={a.id}>
                      <td>{a.id}</td>
                      <td>{a.action}</td>
                      <td>{a.target}</td>
                      <td>{a.operator}</td>
                      <td>{a.detail}</td>
                      <td>{a.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <div className="modal-mask" onClick={() => setShowCreate(false)}>
          <div className="gen-panel ad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bf-head">
              <h3 style={{ margin: 0 }}>新建下发任务</h3>
              <button className="bf-close" onClick={() => setShowCreate(false)}>
                <Icon name="close" size={15} />
              </button>
            </div>
            <div className="ad-form-grid">
              <label className="field">
                <span>资产名称</span>
                <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="例如：秋收节活动传播包" />
              </label>
              <label className="field">
                <span>资产类型</span>
                <select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
                  <option value="平台素材">平台素材</option>
                  <option value="组织素材">组织素材</option>
                  <option value="个人素材">个人素材</option>
                </select>
              </label>
              <label className="field">
                <span>下发层级</span>
                <select value={fromLevel} onChange={(e) => setFromLevel(e.target.value as GrantLevel)}>
                  <option value="市级">市级</option>
                  <option value="区县">区县</option>
                  <option value="乡镇">乡镇</option>
                  <option value="个人">个人</option>
                </select>
              </label>
              <label className="field">
                <span>目标组织单元</span>
                <select value={targetOuId} onChange={(e) => setTargetOuId(e.target.value)}>
                  {ouOptions.length === 0 && <option value="">暂无组织单元</option>}
                  {ouOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>目标层级（兼容）</span>
                <select value={toLevel} onChange={(e) => setToLevel(e.target.value as GrantLevel)}>
                  <option value="市级">市级</option>
                  <option value="区县">区县</option>
                  <option value="乡镇">乡镇</option>
                  <option value="个人">个人</option>
                </select>
              </label>
              <label className="field">
                <span>有效期</span>
                <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
            </div>
            <div className="ad-rights-box">
              <div className="ad-rights-title">权限配置</div>
              <div className="ad-rights-grid">
                {RIGHTS_ALL.map((k) => (
                  <label key={k} className={`ad-right-item ${rights.includes(k) ? "on" : ""}`}>
                    <input type="checkbox" checked={rights.includes(k)} onChange={() => toggleRight(k)} />
                    <span>{k}</span>
                  </label>
                ))}
              </div>
              <label className="ad-approve-row">
                <input type="checkbox" checked={approveRequired} onChange={(e) => setApproveRequired(e.target.checked)} />
                <span>需要审批后生效</span>
              </label>
            </div>
            <div className="gen-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={createGrant} disabled={!assetName.trim()}>创建任务</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
