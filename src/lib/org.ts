/* 企业组织关系（演示）：对齐火山引擎企业组织
 * 参考：
 * - 基本概念 https://www.volcengine.com/docs/6723/105420
 * - 产品功能 https://www.volcengine.com/docs/6723/105185
 * - 配额限制 https://www.volcengine.com/docs/6723/133743
 * - 管控策略 https://www.volcengine.com/docs/6723/147486
 */

import type { AuthUser, TeamMember } from "@/lib/auth";
import { DEMO_TEAM, DEMO_USER } from "@/lib/auth";
import { DEFAULT_REGION_ID, getRegionPack, resolveRegionIdFromText } from "@/data/regionAssets";

/** 配额（对齐火山默认值；可工单扩容的在 UI 标注） */
export const ORG_QUOTAS = {
  /** 组织单元层级：Root 下仅市 / 县 / 区三级 */
  maxDepth: 3,
  /** 账号数，默认可工单扩至 1000 */
  maxAccounts: 20,
  maxAccountsUpgrade: 1000,
  /** 组织单元数，默认可工单扩至 500 */
  maxUnits: 20,
  maxUnitsUpgrade: 500,
  /** 单 OU 内账号数：不限制 */
  maxAccountsPerUnit: Infinity,
  /** 自定义管控策略数 */
  maxPolicies: 100,
  /** 单目标可直接绑定的策略数，可扩至 20 */
  maxPolicyTargets: 5,
  maxPolicyTargetsUpgrade: 20,
  /** 认证主体：不限制 */
  maxCertSubjects: Infinity,
} as const;

/** 新建成员默认初始密码 */
export const DEFAULT_MEMBER_PASSWORD = "mfzh1234";

export const ORG_MAX_DEPTH = ORG_QUOTAS.maxDepth;

/** Root 下三级行政单元：市 → 县 → 区 */
export const OU_LEVEL_LABELS = ["市", "县", "区"] as const;
export type OuAdminLevel = (typeof OU_LEVEL_LABELS)[number];
export const ORG_MAX_UNITS = ORG_QUOTAS.maxUnits;
export const ORG_MAX_ACCOUNTS = ORG_QUOTAS.maxAccounts;

/**
 * 组织账号类型（对外统一三类）：
 * - admin → 主账号（组织所有者，唯一）
 * - ou_admin → 管理员账号（可管理成员）
 * - member → 成员账号
 */
export type MembershipRole = "admin" | "ou_admin" | "member";
export type MembershipStatus = "active" | "disabled";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired";

/** 新建/编辑可选的非主账号类型 */
export type AssignableAccountRole = Exclude<MembershipRole, "admin">;

/** 魔方可信业务模块（对齐火山「可信服务」） */
export type TrustedModuleKey =
  | "image"
  | "content"
  | "video"
  | "research"
  | "storage"
  | "regionEnhance";

export interface Organization {
  id: string;
  name: string;
  rootOuId: string;
  adminUserId: string;
  companyId: string;
  /** 是否已开启企业组织（火山：开启/关闭企业组织） */
  enabled: boolean;
  /** 是否启用管控策略（火山：开启管控策略后才生效） */
  policyEnabled: boolean;
  /** 允许加入的认证主体（企业实名主体） */
  certSubjects: string[];
  createdAt: string;
}

export interface OrgUnit {
  id: string;
  orgId: string;
  parentId: string | null;
  name: string;
  regionId?: string;
  tags: string[];
  description?: string;
}

export interface Membership {
  id: string;
  userId: string;
  orgId: string;
  ouId: string;
  role: MembershipRole;
  status: MembershipStatus;
  /** 控制台登录开关（火山：启用/关闭成员控制台登录） */
  consoleLogin: boolean;
  /** 安全手机（演示） */
  securePhone?: string;
  tags: string[];
  memberId: string;
  name: string;
  account: string;
  /** 创建人 userId：子账号只能管理自己创建的下级；主账号可管理全部子账号 */
  createdByUserId?: string;
}

export interface Invitation {
  id: string;
  orgId: string;
  inviteeAccount: string;
  inviteeName: string;
  targetOuId: string;
  status: InvitationStatus;
  createdAt: string;
  /** 邀请人，接受后写入成员 createdByUserId */
  invitedByUserId?: string;
}

/**
 * 管控策略：划定最大权限边界，不直接授权（对齐火山 SCP）
 * effect=allow 表示边界内允许的模块；未列出的视为隐式拒绝
 */
export interface ControlPolicy {
  id: string;
  orgId: string;
  name: string;
  description: string;
  /** 系统预设不可删 */
  system?: boolean;
  /** 允许的业务模块 key */
  allowModules: TrustedModuleKey[];
  /** 算力日配额上限，-1 表示不限 */
  computeDailyLimit: number;
  /** 资产权限上限 */
  assetRightsMax: Array<"查看" | "使用" | "下载" | "管理" | "转授权">;
  createdAt: string;
}

export interface PolicyAttachment {
  id: string;
  policyId: string;
  /** 绑定目标：OU 或成员 membershipId；Root 用 rootOuId */
  targetType: "ou" | "member";
  targetId: string;
}

export interface TrustedService {
  key: TrustedModuleKey;
  name: string;
  description: string;
  enabled: boolean;
  /** 代理管理员账号（火山：Delegated Administrator） */
  delegatedAdminUserId?: string;
}

export interface OrgStore {
  version: 2;
  organization: Organization;
  units: OrgUnit[];
  memberships: Membership[];
  invitations: Invitation[];
  members: TeamMember[];
  policies: ControlPolicy[];
  policyAttachments: PolicyAttachment[];
  trustedServices: TrustedService[];
}

const STORE_KEY = "mofun.org.store.v2";
const LEGACY_KEY = "mofun.org.store.v1";

export const TRUSTED_MODULE_DEFS: Array<{
  key: TrustedModuleKey;
  name: string;
  description: string;
}> = [
  { key: "image", name: "品牌设计", description: "活动/商拍/logo/IP/字体/店招出图" },
  { key: "content", name: "文案策划", description: "社媒/公众号等内容创作" },
  { key: "video", name: "视频宣传", description: "一句话成片/制作大片/数字人" },
  { key: "research", name: "市场调研", description: "品牌/产业/爆款分析" },
  { key: "storage", name: "仓库与下发", description: "品牌资产、组织素材下发回收" },
  { key: "regionEnhance", name: "本地增强", description: "Lora / 知识库按 OU 注入" },
];

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowText() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fullAccessPolicy(orgId: string): ControlPolicy {
  return {
    id: `pol_full_${orgId}`,
    orgId,
    name: "FullMofunAccess",
    description: "系统预设：全量业务可用（对齐火山 FullVolcAccess）",
    system: true,
    allowModules: TRUSTED_MODULE_DEFS.map((m) => m.key),
    computeDailyLimit: -1,
    assetRightsMax: ["查看", "使用", "下载", "管理", "转授权"],
    createdAt: nowText(),
  };
}

function defaultTrustedServices(): TrustedService[] {
  return TRUSTED_MODULE_DEFS.map((m) => ({
    key: m.key,
    name: m.name,
    description: m.description,
    enabled: true,
  }));
}

export function createDemoOrgStore(user?: AuthUser | null): OrgStore {
  const u = user || DEMO_USER;
  const orgId = `org_${u.companyId}`;
  const rootId = `ou_root_${u.companyId}`;
  const ouCity = `ou_city_${u.companyId}`;
  const ouCountyAnji = `ou_anji_${u.companyId}`;
  const ouDistrict = `ou_dist_${u.companyId}`;
  const ouCountyDeqing = `ou_deqing_${u.companyId}`;

  const members: TeamMember[] = [
    {
      ...DEMO_TEAM[0],
      id: "m1",
      name: u.nickname || u.username,
      account: u.username,
      userId: u.userId,
      isPrimary: true,
      department: "Root",
      role: "主账号",
      status: "正常",
      avatarUrl: u.avatarUrl,
    },
    {
      id: "m2",
      name: "运营小安",
      account: "13800001111",
      userId: "qy_demo_anji_ops",
      passwordPlain: DEFAULT_MEMBER_PASSWORD,
      department: "湖州市",
      role: "管理员账号",
      status: "正常",
    },
    {
      id: "m3",
      name: "乡镇小陈",
      account: "13800002222",
      userId: "qy_demo_town_chen",
      passwordPlain: DEFAULT_MEMBER_PASSWORD,
      department: "递铺区",
      role: "成员账号",
      status: "正常",
    },
    {
      id: "m4",
      name: "门店小周",
      account: "13800003333",
      userId: "qy_demo_store_zhou",
      passwordPlain: DEFAULT_MEMBER_PASSWORD,
      department: "德清县",
      role: "成员账号",
      status: "正常",
    },
    {
      id: "m5",
      name: "导购小美",
      account: "13800004444",
      userId: "qy_demo_guide_mei",
      passwordPlain: DEFAULT_MEMBER_PASSWORD,
      department: "德清县",
      role: "成员账号",
      status: "正常",
    },
  ];

  const organization: Organization = {
    id: orgId,
    name: u.orgName || u.company,
    rootOuId: rootId,
    adminUserId: u.userId,
    companyId: u.companyId,
    enabled: true,
    policyEnabled: true,
    certSubjects: [u.company || u.orgName],
    createdAt: u.createdAt || nowText(),
  };

  /** 演示：Root → 市 → 县 → 区（最多三级） */
  const units: OrgUnit[] = [
    {
      id: rootId,
      orgId,
      parentId: null,
      name: "Root",
      tags: ["root"],
      description: "组织根节点；主账号归属于此，可改名，不可删除",
    },
    {
      id: ouCity,
      orgId,
      parentId: rootId,
      name: "湖州市",
      regionId: "huzhou",
      tags: ["市"],
      description: "市级组织单元",
    },
    {
      id: ouCountyAnji,
      orgId,
      parentId: ouCity,
      name: "安吉县",
      regionId: "anji",
      tags: ["县"],
    },
    {
      id: ouDistrict,
      orgId,
      parentId: ouCountyAnji,
      name: "递铺区",
      regionId: "anji",
      tags: ["区"],
      description: "区级组织单元（最底层，不可再嵌套）",
    },
    {
      id: ouCountyDeqing,
      orgId,
      parentId: ouCity,
      name: "德清县",
      regionId: "deqing",
      tags: ["县"],
    },
  ];

  const memberships: Membership[] = [
    {
      id: "ms_1",
      userId: members[0].userId,
      orgId,
      ouId: rootId,
      role: "admin",
      status: "active",
      consoleLogin: true,
      securePhone: u.phone,
      tags: ["主账号"],
      memberId: "m1",
      name: members[0].name,
      account: members[0].account,
    },
    {
      id: "ms_2",
      userId: members[1].userId,
      orgId,
      ouId: ouCity,
      role: "ou_admin",
      status: "active",
      consoleLogin: true,
      securePhone: "13800001111",
      tags: ["管理员账号"],
      memberId: "m2",
      name: members[1].name,
      account: members[1].account,
      createdByUserId: members[0].userId,
    },
    {
      id: "ms_3",
      userId: members[2].userId,
      orgId,
      ouId: ouDistrict,
      role: "member",
      status: "active",
      consoleLogin: true,
      securePhone: "13800002222",
      tags: ["成员账号"],
      memberId: "m3",
      name: members[2].name,
      account: members[2].account,
      createdByUserId: members[1].userId,
    },
    {
      id: "ms_4",
      userId: members[3].userId,
      orgId,
      ouId: ouCountyDeqing,
      role: "member",
      status: "active",
      consoleLogin: true,
      securePhone: "13800003333",
      tags: ["成员账号"],
      memberId: "m4",
      name: members[3].name,
      account: members[3].account,
      createdByUserId: members[0].userId,
    },
    {
      id: "ms_5",
      userId: members[4].userId,
      orgId,
      ouId: ouCountyDeqing,
      role: "member",
      status: "active",
      consoleLogin: true,
      securePhone: "13800004444",
      tags: ["成员账号"],
      memberId: "m5",
      name: members[4].name,
      account: members[4].account,
      createdByUserId: members[0].userId,
    },
  ];

  const full = fullAccessPolicy(orgId);
  const townPolicy: ControlPolicy = {
    id: `pol_town_${orgId}`,
    orgId,
    name: "区级创作边界",
    description: "区级单元仅开放文案/商拍相关能力，限制转授权与高算力",
    allowModules: ["image", "content", "regionEnhance"],
    computeDailyLimit: 50,
    assetRightsMax: ["查看", "使用", "下载"],
    createdAt: nowText(),
  };

  return {
    version: 2,
    organization,
    units,
    memberships,
    invitations: [],
    members,
    policies: [full, townPolicy],
    policyAttachments: [
      {
        id: "pa_root_full",
        policyId: full.id,
        targetType: "ou",
        targetId: rootId,
      },
      {
        id: "pa_town_limit",
        policyId: townPolicy.id,
        targetType: "ou",
        targetId: ouDistrict,
      },
    ],
    trustedServices: defaultTrustedServices(),
  };
}

function migrateV1(raw: unknown, user?: AuthUser | null): OrgStore {
  const seed = createDemoOrgStore(user);
  const old = raw as Partial<OrgStore> & { organization?: Partial<Organization> };
  if (!old?.organization?.id || !Array.isArray(old.units)) return seed;
  return {
    ...seed,
    organization: {
      ...seed.organization,
      ...old.organization,
      enabled: old.organization.enabled ?? true,
      policyEnabled: old.organization.policyEnabled ?? true,
      certSubjects: old.organization.certSubjects?.length
        ? old.organization.certSubjects
        : seed.organization.certSubjects,
    },
    units: old.units as OrgUnit[],
    memberships: (old.memberships || seed.memberships).map((m) => ({
      ...m,
      consoleLogin: m.consoleLogin ?? true,
      tags: m.tags ?? [],
    })),
    invitations: old.invitations || [],
    members: old.members || seed.members,
  };
}

export function loadOrgStore(user?: AuthUser | null): OrgStore {
  if (typeof window === "undefined") return createDemoOrgStore(user);
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OrgStore;
      if (parsed?.version === 2 && parsed.organization?.id) return parsed;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateV1(JSON.parse(legacy), user);
      saveOrgStore(migrated);
      return migrated;
    }
    const seed = createDemoOrgStore(user);
    saveOrgStore(seed);
    return seed;
  } catch {
    return createDemoOrgStore(user);
  }
}

export function saveOrgStore(store: OrgStore) {
  if (typeof window === "undefined") return;
  const next = { ...store, version: 2 as const };
  window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
}

export function resetOrgStore(user?: AuthUser | null): OrgStore {
  const seed = createDemoOrgStore(user);
  saveOrgStore(seed);
  return seed;
}

export function getUnit(store: OrgStore, ouId: string): OrgUnit | undefined {
  return store.units.find((u) => u.id === ouId);
}

export function getChildren(store: OrgStore, parentId: string | null): OrgUnit[] {
  return store.units.filter((u) => u.parentId === parentId);
}

export function getUnitDepth(store: OrgStore, ouId: string): number {
  let depth = 0;
  let cur = getUnit(store, ouId);
  while (cur?.parentId) {
    depth += 1;
    cur = getUnit(store, cur.parentId);
    if (depth > ORG_MAX_DEPTH + 2) break;
  }
  return depth;
}

/** Root 下单元层级标签：1=市，2=县，3=区 */
export function getOuAdminLevel(store: OrgStore, ouId: string): OuAdminLevel | null {
  if (ouId === store.organization.rootOuId) return null;
  const depth = getUnitDepth(store, ouId);
  if (depth < 1 || depth > OU_LEVEL_LABELS.length) return null;
  return OU_LEVEL_LABELS[depth - 1];
}

/** 在 parent 下可新增的下一级标签；已满三级则 null */
export function nextOuLevelLabel(store: OrgStore, parentId: string): OuAdminLevel | null {
  const nextDepth = getUnitDepth(store, parentId) + 1;
  if (nextDepth < 1 || nextDepth > OU_LEVEL_LABELS.length) return null;
  return OU_LEVEL_LABELS[nextDepth - 1];
}

export function canCreateChildOu(store: OrgStore, parentId: string): boolean {
  return nextOuLevelLabel(store, parentId) !== null;
}

export function ouLevelPlaceholder(level: OuAdminLevel): string {
  if (level === "市") return "如：湖州市";
  if (level === "县") return "如：安吉县";
  return "如：递铺区";
}

export function resolveOuRegionId(store: OrgStore, ouId: string): string {
  let cur = getUnit(store, ouId);
  while (cur) {
    if (cur.regionId) return cur.regionId;
    if (!cur.parentId) break;
    cur = getUnit(store, cur.parentId);
  }
  return DEFAULT_REGION_ID;
}

/** 从任意 OU 向上定位市级单元（Root 下第一级） */
export function findCityOuForUnit(store: OrgStore, ouId: string): OrgUnit | undefined {
  let cur = getUnit(store, ouId);
  while (cur) {
    if (cur.id === store.organization.rootOuId) return undefined;
    if (getUnitDepth(store, cur.id) === 1) return cur;
    if (!cur.parentId) break;
    cur = getUnit(store, cur.parentId);
  }
  return undefined;
}

/** 解析 OU 所属市的 regionId（优先 OU.regionId，否则从名称推断） */
export function resolveCityRegionIdFromOu(store: OrgStore, ouId: string): string | undefined {
  const city = findCityOuForUnit(store, ouId);
  if (!city) return undefined;
  if (city.regionId) return city.regionId;
  return resolveRegionIdFromText(city.name);
}

/**
 * 企业成员所属「市」的 regionId。
 * 主账号在 Root 时，从企业名称 / 地址推断；其余成员取组织树市级单元。
 */
export function resolveUserOrgCityRegionId(user?: AuthUser | null): string | undefined {
  if (!user || typeof window === "undefined") return undefined;
  const store = loadOrgStore(user);
  if (!store.organization.enabled) return undefined;
  const ms = store.memberships.find((m) => m.userId === user.userId || m.account === user.username);
  if (!ms) return undefined;
  if (ms.ouId === store.organization.rootOuId) {
    const fromText = resolveRegionIdFromText(
      [user.company, user.orgName, user.address, store.organization.name].filter(Boolean).join(" ")
    );
    return fromText;
  }
  return resolveCityRegionIdFromOu(store, ms.ouId);
}

export function resolveUserOrgRegionId(user?: AuthUser | null): string {
  if (!user) return DEFAULT_REGION_ID;
  if (typeof window === "undefined") return user.regionId || DEFAULT_REGION_ID;
  const store = loadOrgStore(user);
  if (!store.organization.enabled) return user.regionId || DEFAULT_REGION_ID;
  const ms = store.memberships.find((m) => m.userId === user.userId || m.account === user.username);
  if (ms) return resolveOuRegionId(store, ms.ouId);
  return user.regionId || DEFAULT_REGION_ID;
}

export function membersInOu(store: OrgStore, ouId: string): Membership[] {
  return store.memberships.filter((m) => m.ouId === ouId);
}

export function countSubtreeMembers(store: OrgStore, ouId: string): number {
  const ids = new Set<string>([ouId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of store.units) {
      if (u.parentId && ids.has(u.parentId) && !ids.has(u.id)) {
        ids.add(u.id);
        changed = true;
      }
    }
  }
  return store.memberships.filter((m) => ids.has(m.ouId)).length;
}

export function createOrgUnit(
  store: OrgStore,
  parentId: string,
  input: { name: string; regionId?: string; tags?: string[]; description?: string }
): { store: OrgStore; error?: string; unit?: OrgUnit } {
  if (!store.organization.enabled) return { store, error: "企业组织已关闭" };
  const parent = getUnit(store, parentId);
  if (!parent) return { store, error: "父节点不存在" };
  if (store.units.length >= ORG_QUOTAS.maxUnits) {
    return { store, error: `组织单元数已达配额 ${ORG_QUOTAS.maxUnits}（可工单扩至 ${ORG_QUOTAS.maxUnitsUpgrade}）` };
  }
  const depth = getUnitDepth(store, parentId) + 1;
  if (depth > ORG_QUOTAS.maxDepth) {
    return { store, error: "组织单元最多市/县/区三级，当前层级不可继续新增" };
  }
  const name = input.name.trim();
  if (!name) return { store, error: "请填写组织单元名称" };
  const levelLabel = OU_LEVEL_LABELS[depth - 1];
  const inferredRegion =
    !input.regionId && depth === 1 ? resolveRegionIdFromText(name) : undefined;
  const unit: OrgUnit = {
    id: uid("ou"),
    orgId: store.organization.id,
    parentId,
    name,
    regionId: input.regionId || inferredRegion || undefined,
    tags: input.tags?.filter(Boolean).length ? input.tags.filter(Boolean) : [levelLabel],
    description: input.description?.trim() || undefined,
  };
  const next = { ...store, units: [...store.units, unit] };
  saveOrgStore(next);
  return { store: next, unit };
}

export function updateOrgUnit(
  store: OrgStore,
  ouId: string,
  patch: Partial<Pick<OrgUnit, "name" | "regionId" | "tags" | "description">>
): { store: OrgStore; error?: string } {
  const unit = getUnit(store, ouId);
  if (!unit) return { store, error: "组织单元不存在" };
  const nextName = patch.name != null ? patch.name.trim() || unit.name : unit.name;
  if (!nextName) return { store, error: "请填写组织单元名称" };
  const nextUnits = store.units.map((u) => {
    if (u.id !== ouId) return u;
    return {
      ...u,
      name: nextName,
      regionId: patch.regionId === "" ? undefined : patch.regionId ?? u.regionId,
      tags: patch.tags ?? u.tags,
      description: patch.description !== undefined ? patch.description.trim() || undefined : u.description,
    };
  });
  // 改名后同步成员 department 展示字段
  let nextMembers = store.members;
  if (nextName !== unit.name) {
    nextMembers = store.members.map((m) => {
      const ms = store.memberships.find((x) => x.memberId === m.id);
      if (ms?.ouId === ouId) return { ...m, department: nextName };
      if (m.isPrimary && ouId === store.organization.rootOuId) return { ...m, department: nextName };
      return m;
    });
  }
  const next = { ...store, units: nextUnits, members: nextMembers };
  saveOrgStore(next);
  return { store: next };
}

export function deleteOrgUnit(store: OrgStore, ouId: string): { store: OrgStore; error?: string } {
  const block = orgUnitDeleteBlockReason(store, ouId);
  if (block) return { store, error: block };
  const next = {
    ...store,
    units: store.units.filter((u) => u.id !== ouId),
    invitations: store.invitations.filter(
      (i) => !(i.targetOuId === ouId && i.status === "pending")
    ),
    policyAttachments: store.policyAttachments.filter(
      (a) => !(a.targetType === "ou" && a.targetId === ouId)
    ),
  };
  saveOrgStore(next);
  return { store: next };
}

/** 主账号可维护组织树（增删改 OU） */
export function canManageOrgStructure(
  store: OrgStore,
  actorUserId?: string | null,
  user?: AuthUser | null
): boolean {
  return isOrgAdminActor(store, actorUserId, user);
}

/** 不可删除时的原因；可删则返回 null */
export function orgUnitDeleteBlockReason(store: OrgStore, ouId: string): string | null {
  if (ouId === store.organization.rootOuId) return "根节点不可删除";
  if (!getUnit(store, ouId)) return "组织单元不存在";
  const childCount = getChildren(store, ouId).length;
  if (childCount) return `请先删除 ${childCount} 个子组织单元`;
  const memberCount = membersInOu(store, ouId).length;
  if (memberCount) return `请先将 ${memberCount} 名成员移出该单元`;
  const pendingInvites = store.invitations.filter(
    (i) => i.targetOuId === ouId && i.status === "pending"
  ).length;
  if (pendingInvites) return `请先处理 ${pendingInvites} 条待处理邀请`;
  return null;
}

export function moveMembership(
  store: OrgStore,
  membershipId: string,
  targetOuId: string
): { store: OrgStore; error?: string } {
  const target = getUnit(store, targetOuId);
  if (!target) return { store, error: "目标组织单元不存在" };
  const ms = store.memberships.find((m) => m.id === membershipId);
  if (!ms) return { store, error: "成员不存在" };
  const nextMs = store.memberships.map((m) => (m.id === membershipId ? { ...m, ouId: targetOuId } : m));
  const nextMembers = store.members.map((m) =>
    m.id === ms.memberId ? { ...m, department: target.name } : m
  );
  const next = { ...store, memberships: nextMs, members: nextMembers };
  saveOrgStore(next);
  return { store: next };
}

/** 将成员挂到指定 OU（无 membership 时自动补齐；主账号不可迁出 Root） */
export function assignMemberToOu(
  store: OrgStore,
  memberId: string,
  targetOuId: string,
  opts?: { createdByUserId?: string }
): { store: OrgStore; error?: string } {
  const target = getUnit(store, targetOuId);
  if (!target) return { store, error: "目标组织单元不存在" };
  const member = store.members.find((m) => m.id === memberId);
  if (!member) return { store, error: "成员不存在" };
  if (member.isPrimary && targetOuId !== store.organization.rootOuId) {
    return { store, error: "主账号固定归属根节点" };
  }
  const existing = store.memberships.find((m) => m.memberId === memberId);
  if (existing) {
    if (existing.ouId === targetOuId) {
      const nextMembers = store.members.map((m) =>
        m.id === memberId ? { ...m, department: target.name } : m
      );
      const next = { ...store, members: nextMembers };
      saveOrgStore(next);
      return { store: next };
    }
    return moveMembership(store, existing.id, targetOuId);
  }
  const membership: Membership = {
    id: uid("ms"),
    userId: member.userId,
    orgId: store.organization.id,
    ouId: targetOuId,
    role: member.isPrimary ? "admin" : "member",
    status: member.status === "停用" ? "disabled" : "active",
    consoleLogin: true,
    tags: member.isPrimary ? ["主账号"] : [],
    memberId,
    name: member.name,
    account: member.account,
    createdByUserId: opts?.createdByUserId,
  };
  const next: OrgStore = {
    ...store,
    memberships: [...store.memberships, membership],
    members: store.members.map((m) => (m.id === memberId ? { ...m, department: target.name } : m)),
  };
  saveOrgStore(next);
  return { store: next };
}

export function setMembershipStatus(
  store: OrgStore,
  membershipId: string,
  status: MembershipStatus
): { store: OrgStore; error?: string } {
  const ms = store.memberships.find((m) => m.id === membershipId);
  if (!ms) return { store, error: "成员不存在" };
  if (ms.role === "admin" && status === "disabled") return { store, error: "主账号不可停用" };
  const nextMs = store.memberships.map((m) => (m.id === membershipId ? { ...m, status } : m));
  const nextMembers = store.members.map((m) =>
    m.id === ms.memberId
      ? { ...m, status: status === "active" ? ("正常" as const) : ("停用" as const) }
      : m
  );
  const next = { ...store, memberships: nextMs, members: nextMembers };
  saveOrgStore(next);
  return { store: next };
}

export function setConsoleLogin(
  store: OrgStore,
  membershipId: string,
  consoleLogin: boolean
): { store: OrgStore; error?: string } {
  const ms = store.memberships.find((m) => m.id === membershipId);
  if (!ms) return { store, error: "成员不存在" };
  if (ms.role === "admin" && !consoleLogin) return { store, error: "主账号不可关闭控制台登录" };
  const nextMs = store.memberships.map((m) => (m.id === membershipId ? { ...m, consoleLogin } : m));
  const next = { ...store, memberships: nextMs };
  saveOrgStore(next);
  return { store: next };
}

export function updateMembershipTags(
  store: OrgStore,
  membershipId: string,
  tags: string[]
): { store: OrgStore; error?: string } {
  const nextMs = store.memberships.map((m) =>
    m.id === membershipId ? { ...m, tags: tags.filter(Boolean) } : m
  );
  const next = { ...store, memberships: nextMs };
  saveOrgStore(next);
  return { store: next };
}

/** 移除成员账号（火山 RemoveAccount）：主账号不可移除 */
export function removeMembership(
  store: OrgStore,
  membershipId: string
): { store: OrgStore; error?: string } {
  const ms = store.memberships.find((m) => m.id === membershipId);
  if (!ms) return { store, error: "成员不存在" };
  if (ms.role === "admin") return { store, error: "不可移除主账号" };
  const next = {
    ...store,
    memberships: store.memberships.filter((m) => m.id !== membershipId),
    members: store.members.filter((m) => m.id !== ms.memberId),
    policyAttachments: store.policyAttachments.filter(
      (a) => !(a.targetType === "member" && a.targetId === membershipId)
    ),
  };
  saveOrgStore(next);
  return { store: next };
}

export function createMemberInOu(
  store: OrgStore,
  ouId: string,
  input: {
    name: string;
    account: string;
    role?: MembershipRole;
    tags?: string[];
    passwordPlain?: string;
    createdByUserId?: string;
  }
): { store: OrgStore; error?: string } {
  if (!store.organization.enabled) return { store, error: "企业组织已关闭" };
  const unit = getUnit(store, ouId);
  if (!unit) return { store, error: "组织单元不存在" };
  if (store.memberships.length >= ORG_QUOTAS.maxAccounts) {
    return { store, error: `账号数已达配额 ${ORG_QUOTAS.maxAccounts}（可工单扩至 ${ORG_QUOTAS.maxAccountsUpgrade}）` };
  }
  const account = input.account.trim();
  const name = input.name.trim() || account;
  if (!account) return { store, error: "请填写账号" };
  if (store.memberships.some((m) => m.account === account)) return { store, error: "该账号已在组织中" };
  const pwd = (input.passwordPlain ?? DEFAULT_MEMBER_PASSWORD).trim() || DEFAULT_MEMBER_PASSWORD;
  const memberId = uid("m");
  const userId = uid("qy");
  const role: MembershipRole =
    input.role === "admin" ? "member" : input.role === "ou_admin" ? "ou_admin" : "member";
  const member: TeamMember = {
    id: memberId,
    name,
    account,
    userId,
    passwordPlain: pwd,
    department: unit.name,
    role: roleLabel(role),
    status: "正常",
  };
  const membership: Membership = {
    id: uid("ms"),
    userId,
    orgId: store.organization.id,
    ouId,
    role,
    status: "active",
    consoleLogin: true,
    tags: input.tags?.length ? input.tags : [roleLabel(role)],
    memberId,
    name,
    account,
    createdByUserId: input.createdByUserId,
  };
  const next = {
    ...store,
    members: [...store.members, member],
    memberships: [...store.memberships, membership],
  };
  saveOrgStore(next);
  return { store: next };
}

export function inviteMember(
  store: OrgStore,
  input: { inviteeAccount: string; inviteeName?: string; targetOuId: string; invitedByUserId?: string }
): { store: OrgStore; error?: string; invitation?: Invitation } {
  if (!store.organization.enabled) return { store, error: "企业组织已关闭" };
  const unit = getUnit(store, input.targetOuId);
  if (!unit) return { store, error: "目标组织单元不存在" };
  const account = input.inviteeAccount.trim();
  if (!account) return { store, error: "请填写受邀账号" };
  if (store.memberships.some((m) => m.account === account)) return { store, error: "该账号已是组织成员" };
  if (store.invitations.some((i) => i.inviteeAccount === account && i.status === "pending")) {
    return { store, error: "已有待处理邀请" };
  }
  const invitation: Invitation = {
    id: uid("inv"),
    orgId: store.organization.id,
    inviteeAccount: account,
    inviteeName: input.inviteeName?.trim() || account,
    targetOuId: input.targetOuId,
    status: "pending",
    createdAt: nowText(),
    invitedByUserId: input.invitedByUserId,
  };
  const next = { ...store, invitations: [invitation, ...store.invitations] };
  saveOrgStore(next);
  return { store: next, invitation };
}

export function acceptInvitation(store: OrgStore, invitationId: string): { store: OrgStore; error?: string } {
  const inv = store.invitations.find((i) => i.id === invitationId);
  if (!inv || inv.status !== "pending") return { store, error: "邀请不可用" };
  const created = createMemberInOu(store, inv.targetOuId, {
    name: inv.inviteeName,
    account: inv.inviteeAccount,
    createdByUserId: inv.invitedByUserId,
  });
  if (created.error) return { store, error: created.error };
  const nextInv = created.store.invitations.map((i) =>
    i.id === invitationId ? { ...i, status: "accepted" as const } : i
  );
  const next = { ...created.store, invitations: nextInv };
  saveOrgStore(next);
  return { store: next };
}

export function cancelInvitation(store: OrgStore, invitationId: string): { store: OrgStore; error?: string } {
  const nextInv = store.invitations.map((i) =>
    i.id === invitationId && i.status === "pending" ? { ...i, status: "expired" as const } : i
  );
  const next = { ...store, invitations: nextInv };
  saveOrgStore(next);
  return { store: next };
}

export function setOrgEnabled(store: OrgStore, enabled: boolean): OrgStore {
  const next = {
    ...store,
    organization: { ...store.organization, enabled },
  };
  saveOrgStore(next);
  return next;
}

export function setPolicyEnabled(store: OrgStore, policyEnabled: boolean): OrgStore {
  const next = {
    ...store,
    organization: { ...store.organization, policyEnabled },
  };
  saveOrgStore(next);
  return next;
}

export function addCertSubject(store: OrgStore, subject: string): { store: OrgStore; error?: string } {
  const name = subject.trim();
  if (!name) return { store, error: "请填写认证主体名称" };
  if (store.organization.certSubjects.includes(name)) return { store, error: "该认证主体已存在" };
  const next = {
    ...store,
    organization: {
      ...store.organization,
      certSubjects: [...store.organization.certSubjects, name],
    },
  };
  saveOrgStore(next);
  return { store: next };
}

export function removeCertSubject(store: OrgStore, subject: string): { store: OrgStore; error?: string } {
  if (store.organization.certSubjects.length <= 1) {
    return { store, error: "至少保留一个认证主体（管理员主体）" };
  }
  const next = {
    ...store,
    organization: {
      ...store.organization,
      certSubjects: store.organization.certSubjects.filter((s) => s !== subject),
    },
  };
  saveOrgStore(next);
  return { store: next };
}

export function createPolicy(
  store: OrgStore,
  input: {
    name: string;
    description?: string;
    allowModules: TrustedModuleKey[];
    computeDailyLimit: number;
    assetRightsMax: ControlPolicy["assetRightsMax"];
  }
): { store: OrgStore; error?: string; policy?: ControlPolicy } {
  const customCount = store.policies.filter((p) => !p.system).length;
  if (customCount >= ORG_QUOTAS.maxPolicies) {
    return { store, error: `自定义管控策略数已达配额 ${ORG_QUOTAS.maxPolicies}` };
  }
  const name = input.name.trim();
  if (!name) return { store, error: "请填写策略名称" };
  const policy: ControlPolicy = {
    id: uid("pol"),
    orgId: store.organization.id,
    name,
    description: input.description?.trim() || "",
    allowModules: input.allowModules,
    computeDailyLimit: input.computeDailyLimit,
    assetRightsMax: input.assetRightsMax,
    createdAt: nowText(),
  };
  const next = { ...store, policies: [...store.policies, policy] };
  saveOrgStore(next);
  return { store: next, policy };
}

export function deletePolicy(store: OrgStore, policyId: string): { store: OrgStore; error?: string } {
  const pol = store.policies.find((p) => p.id === policyId);
  if (!pol) return { store, error: "策略不存在" };
  if (pol.system) return { store, error: "系统预设策略不可删除" };
  const next = {
    ...store,
    policies: store.policies.filter((p) => p.id !== policyId),
    policyAttachments: store.policyAttachments.filter((a) => a.policyId !== policyId),
  };
  saveOrgStore(next);
  return { store: next };
}

export function attachPolicy(
  store: OrgStore,
  policyId: string,
  targetType: "ou" | "member",
  targetId: string
): { store: OrgStore; error?: string } {
  if (!store.policies.some((p) => p.id === policyId)) return { store, error: "策略不存在" };
  if (targetType === "member") {
    const ms = store.memberships.find((m) => m.id === targetId);
    if (ms?.role === "admin") return { store, error: "管控策略不可直接绑定主账号" };
  }
  const attached = store.policyAttachments.filter(
    (a) => a.targetType === targetType && a.targetId === targetId
  );
  if (attached.length >= ORG_QUOTAS.maxPolicyTargets) {
    return {
      store,
      error: `单目标最多绑定 ${ORG_QUOTAS.maxPolicyTargets} 条策略（可工单扩至 ${ORG_QUOTAS.maxPolicyTargetsUpgrade}）`,
    };
  }
  if (attached.some((a) => a.policyId === policyId)) return { store, error: "已绑定该策略" };
  const next = {
    ...store,
    policyAttachments: [
      ...store.policyAttachments,
      { id: uid("pa"), policyId, targetType, targetId },
    ],
  };
  saveOrgStore(next);
  return { store: next };
}

export function detachPolicy(
  store: OrgStore,
  attachmentId: string
): { store: OrgStore; error?: string } {
  const next = {
    ...store,
    policyAttachments: store.policyAttachments.filter((a) => a.id !== attachmentId),
  };
  saveOrgStore(next);
  return { store: next };
}

/** 解析目标生效模块：直接绑定 ∩ 祖先继承；策略关闭时视为全开 */
export function resolveEffectiveModules(
  store: OrgStore,
  ouId: string
): TrustedModuleKey[] {
  if (!store.organization.policyEnabled) {
    return TRUSTED_MODULE_DEFS.map((m) => m.key);
  }
  const chain: string[] = [];
  let cur = getUnit(store, ouId);
  while (cur) {
    chain.push(cur.id);
    if (!cur.parentId) break;
    cur = getUnit(store, cur.parentId);
  }
  const allModules = TRUSTED_MODULE_DEFS.map((m) => m.key);
  let allowed: Set<TrustedModuleKey> | null = null;
  for (const id of chain.reverse()) {
    const attaches = store.policyAttachments.filter((a) => a.targetType === "ou" && a.targetId === id);
    if (!attaches.length) continue;
    const sets = attaches.map((a) => {
      const pol = store.policies.find((p) => p.id === a.policyId);
      return new Set(pol?.allowModules || []);
    });
    const intersect = sets.reduce((acc, s) => {
      if (!acc) return s;
      return new Set([...acc].filter((k) => s.has(k)));
    }, null as Set<TrustedModuleKey> | null)!;
    allowed = allowed
      ? new Set([...allowed].filter((k: TrustedModuleKey) => intersect.has(k)))
      : intersect;
  }
  return allowed ? [...allowed] : allModules;
}

export function setTrustedService(
  store: OrgStore,
  key: TrustedModuleKey,
  enabled: boolean,
  delegatedAdminUserId?: string
): OrgStore {
  const next = {
    ...store,
    trustedServices: store.trustedServices.map((t) =>
      t.key === key
        ? {
            ...t,
            enabled,
            delegatedAdminUserId: delegatedAdminUserId ?? t.delegatedAdminUserId,
          }
        : t
    ),
  };
  saveOrgStore(next);
  return next;
}

export function regionOptions(): { id: string; name: string }[] {
  return ["anji", "deqing", "changxing", "huzhou", "wuxing"].map((id) => ({
    id,
    name: getRegionPack(id).regionName,
  }));
}

/** 账号类型展示名：主账号 / 管理员账号 / 成员账号 */
export function roleLabel(role: MembershipRole): string {
  if (role === "admin") return "主账号";
  if (role === "ou_admin") return "管理员账号";
  return "成员账号";
}

/** 解析成员的账号类型（主账号优先看 isPrimary） */
export function resolveMemberAccountRole(
  store: OrgStore,
  member: TeamMember
): MembershipRole {
  if (member.isPrimary) return "admin";
  const ms = findMembershipByMemberId(store, member.id);
  if (ms?.role === "admin") return "admin";
  if (ms?.role === "ou_admin") return "ou_admin";
  return "member";
}

/** 更新非主账号的账号类型（管理员 / 成员）；仅主账号可操作 */
export function updateMemberAccountRole(
  store: OrgStore,
  memberId: string,
  role: AssignableAccountRole
): { store: OrgStore; error?: string } {
  const member = store.members.find((m) => m.id === memberId);
  if (!member) return { store, error: "成员不存在" };
  if (member.isPrimary) return { store, error: "主账号类型不可更改" };
  const ms = findMembershipByMemberId(store, memberId);
  if (!ms) return { store, error: "成员关系不存在" };
  if (ms.role === "admin") return { store, error: "主账号类型不可更改" };
  const nextRole: MembershipRole = role === "ou_admin" ? "ou_admin" : "member";
  const label = roleLabel(nextRole);
  const next: OrgStore = {
    ...store,
    members: store.members.map((m) => (m.id === memberId ? { ...m, role: label } : m)),
    memberships: store.memberships.map((m) =>
      m.memberId === memberId
        ? {
            ...m,
            role: nextRole,
            tags: m.tags.includes(label)
              ? m.tags
              : [...m.tags.filter((t) => t !== "管理员账号" && t !== "成员账号"), label],
          }
        : m
    ),
  };
  saveOrgStore(next);
  return { store: next };
}

/** 当前登录用户在组织中的成员关系 */
export function findMembershipByUserId(store: OrgStore, userId?: string | null): Membership | undefined {
  if (!userId) return undefined;
  return store.memberships.find((m) => m.userId === userId);
}

export function findMembershipByMemberId(store: OrgStore, memberId: string): Membership | undefined {
  return store.memberships.find((m) => m.memberId === memberId);
}

/** 用 userId / 账号 / 昵称 等定位当前操作者对应的 TeamMember */
export function findActorTeamMember(store: OrgStore, user?: AuthUser | null): TeamMember | undefined {
  if (!user) return undefined;
  const keys = [user.userId, user.username, user.email, user.phone, user.nickname, user.workEmail].filter(
    Boolean,
  ) as string[];

  for (const key of keys) {
    const byUserId = store.members.find((m) => m.userId === key);
    if (byUserId) return byUserId;
    const byAcctOrName = store.members.find((m) => m.account === key || m.name === key);
    if (byAcctOrName) return byAcctOrName;
  }

  const adminMs = store.memberships.find(
    (m) =>
      m.role === "admin" &&
      keys.some((k) => m.userId === k || m.account === k || m.name === k),
  );
  if (adminMs) {
    return store.members.find((m) => m.id === adminMs.memberId);
  }

  return undefined;
}

/**
 * 是否企业主账号（组织所有者）。
 * 兼容本地 store 与登录态 userId 漂移：按 adminUserId、membership.role、isPrimary、账号匹配。
 */
export function isOrgAdminActor(
  store: OrgStore,
  actorUserId?: string | null,
  user?: AuthUser | null
): boolean {
  const uid = actorUserId || user?.userId;
  if (uid && store.organization.adminUserId === uid) return true;
  if (uid) {
    const ms = findMembershipByUserId(store, uid);
    if (ms?.role === "admin") return true;
  }
  const tm = findActorTeamMember(store, user) || (uid ? store.members.find((m) => m.userId === uid) : undefined);
  if (tm?.isPrimary) return true;
  const acct = user?.username || user?.email;
  const phone = user?.phone?.trim();
  if (acct && store.members.some((m) => m.isPrimary && (m.account === acct || m.name === acct))) return true;
  if (phone && store.members.some((m) => m.isPrimary && m.account === phone)) return true;
  if (acct && store.memberships.some((m) => m.role === "admin" && (m.account === acct || m.name === acct))) {
    return true;
  }
  if (
    user?.enterpriseVerified &&
    user.companyId &&
    store.organization.companyId === user.companyId &&
    (!tm || tm.isPrimary)
  ) {
    return true;
  }
  return false;
}

/** 是否管理员账号（含主账号）：可管理成员 */
export function isOrgManagerActor(
  store: OrgStore,
  actorUserId?: string | null,
  user?: AuthUser | null
): boolean {
  if (isOrgAdminActor(store, actorUserId, user)) return true;
  const uid = actorUserId || user?.userId;
  if (uid) {
    const ms = findMembershipByUserId(store, uid);
    if (ms?.role === "ou_admin") return true;
  }
  const tm = findActorTeamMember(store, user);
  if (tm) {
    const role = resolveMemberAccountRole(store, tm);
    if (role === "ou_admin") return true;
  }
  return false;
}

/** 把登录用户与 store 中主账号 userId / adminUserId 对齐（修复权限点不了） */
export function syncOrgAdminIdentity(store: OrgStore, user?: AuthUser | null): OrgStore {
  if (!user?.userId) return store;
  const acct = user.username || user.email;
  const phone = user.phone?.trim();
  const primary =
    store.members.find((m) => m.isPrimary) ||
    (acct ? store.members.find((m) => m.account === acct || m.name === acct) : undefined) ||
    (phone ? store.members.find((m) => m.account === phone) : undefined);

  if (!primary) return store;

  const ownsByCompany =
    !!user.enterpriseVerified &&
    !!user.companyId &&
    user.companyId === store.organization.companyId;

  const looksLikeThisAdmin =
    primary.userId === user.userId ||
    (!!acct && (primary.account === acct || primary.name === acct)) ||
    (!!phone && primary.account === phone) ||
    (!!user.nickname && primary.name === user.nickname) ||
    store.organization.adminUserId === user.userId ||
    ownsByCompany ||
    store.memberships.some(
      (m) =>
        m.role === "admin" &&
        (m.userId === user.userId ||
          (!!acct && (m.account === acct || m.name === acct)) ||
          (!!phone && m.account === phone)),
    );
  if (!looksLikeThisAdmin) return store;

  let changed = false;
  let members = store.members;
  let memberships = store.memberships;
  let organization = store.organization;

  if (primary.userId !== user.userId) {
    members = members.map((m) =>
      m.id === primary.id ? { ...m, userId: user.userId, isPrimary: true } : m
    );
    changed = true;
  }
  const adminMs =
    memberships.find((m) => m.memberId === primary.id) ||
    memberships.find((m) => m.role === "admin");
  if (adminMs && (adminMs.userId !== user.userId || adminMs.role !== "admin")) {
    memberships = memberships.map((m) =>
      m.id === adminMs.id
        ? {
            ...m,
            userId: user.userId,
            role: "admin",
            account: acct || m.account,
            name: m.name || primary.name,
          }
        : m
    );
    changed = true;
  }
  if (organization.adminUserId !== user.userId) {
    organization = { ...organization, adminUserId: user.userId };
    changed = true;
  }

  // 主账号归属根节点（根节点名称可自定义，不再强制改回 Root）
  const rootId = organization.rootOuId;
  const rootUnit = store.units.find((u) => u.id === rootId);
  const rootName = rootUnit?.name || "Root";
  const units = store.units;
  const primaryMs = memberships.find((m) => m.memberId === primary.id) || memberships.find((m) => m.role === "admin");
  if (primaryMs && primaryMs.ouId !== rootId) {
    memberships = memberships.map((m) => (m.id === primaryMs.id ? { ...m, ouId: rootId } : m));
    members = members.map((m) =>
      m.id === primary.id ? { ...m, department: rootName, isPrimary: true } : m
    );
    changed = true;
  } else if (primary.department !== rootName) {
    members = members.map((m) => (m.id === primary.id ? { ...m, department: rootName } : m));
    changed = true;
  }

  if (!changed) return store;
  const next = { ...store, members, memberships, organization, units };
  saveOrgStore(next);
  return next;
}

/** 主账号可管管理员账号与成员账号；管理员账号仅可管成员账号；成员账号仅可管自己创建的下级 */
export function canManageSubAccount(
  store: OrgStore,
  actorUserId: string | null | undefined,
  target: TeamMember,
  user?: AuthUser | null
): boolean {
  if (target.isPrimary) return false;
  const targetRole = resolveMemberAccountRole(store, target);
  if (targetRole === "admin") return false;

  if (isOrgAdminActor(store, actorUserId, user)) {
    return targetRole === "ou_admin" || targetRole === "member";
  }

  if (isOrgManagerActor(store, actorUserId, user)) {
    return targetRole === "member";
  }

  const uid = actorUserId || user?.userId;
  if (!uid) return false;
  const targetMs = findMembershipByMemberId(store, target.id);
  return targetRole === "member" && !!targetMs?.createdByUserId && targetMs.createdByUserId === uid;
}

/**
 * 能否改账号/密码：
 * - 可管理的子账号
 * - 或改自己（userId / 账号匹配）
 */
export function canEditMemberCredentials(
  store: OrgStore,
  actorUserId: string | null | undefined,
  target: TeamMember,
  user?: AuthUser | null
): boolean {
  const uid = actorUserId || user?.userId;
  const acct = user?.username || user?.email;
  const phone = user?.phone?.trim();
  if (uid && target.userId === uid) return true;
  if (acct && (target.account === acct || target.name === acct)) return true;
  if (phone && target.account === phone) return true;
  if (user?.nickname && target.name === user.nickname) return true;
  const actor = findActorTeamMember(store, user);
  if (actor && actor.id === target.id) return true;
  const actorMs = uid ? findMembershipByUserId(store, uid) : undefined;
  if (actorMs?.memberId === target.id) return true;
  return canManageSubAccount(store, uid, target, user);
}

/** 能否删除：不可删主账号与自己；其余同 canManageSubAccount */
export function canDeleteMember(
  store: OrgStore,
  actorUserId: string | null | undefined,
  target: TeamMember,
  user?: AuthUser | null
): boolean {
  if (target.isPrimary) return false;
  const uid = actorUserId || user?.userId;
  const acct = user?.username || user?.email;
  if (uid && target.userId === uid) return false;
  if (acct && target.account === acct) return false;
  const actor = findActorTeamMember(store, user);
  if (actor && actor.id === target.id) return false;
  return canManageSubAccount(store, uid, target, user);
}

/** 更新成员展示名（同步 TeamMember + Membership） */
export function updateMemberDisplayName(
  store: OrgStore,
  memberId: string,
  name: string
): { store: OrgStore; error?: string } {
  const nextName = name.trim();
  if (!nextName) return { store, error: "请填写显示名称" };
  if (!store.members.some((m) => m.id === memberId)) return { store, error: "成员不存在" };
  const next: OrgStore = {
    ...store,
    members: store.members.map((m) => (m.id === memberId ? { ...m, name: nextName } : m)),
    memberships: store.memberships.map((m) =>
      m.memberId === memberId ? { ...m, name: nextName } : m
    ),
  };
  saveOrgStore(next);
  return { store: next };
}

/** 更新成员账号（同步 TeamMember + Membership） */
export function updateMemberAccount(
  store: OrgStore,
  memberId: string,
  account: string,
  name?: string
): { store: OrgStore; error?: string } {
  const full = account.trim();
  if (!full) return { store, error: "请填写账号" };
  if (store.memberships.some((m) => m.account === full && m.memberId !== memberId)) {
    return { store, error: "该账号已被占用" };
  }
  if (store.members.some((m) => m.account === full && m.id !== memberId)) {
    return { store, error: "该账号已被占用" };
  }
  const member = store.members.find((m) => m.id === memberId);
  if (!member) return { store, error: "成员不存在" };
  const nextName = (name ?? member.name).trim() || full;
  const next: OrgStore = {
    ...store,
    members: store.members.map((m) =>
      m.id === memberId ? { ...m, account: full, name: nextName } : m
    ),
    memberships: store.memberships.map((m) =>
      m.memberId === memberId ? { ...m, account: full, name: nextName } : m
    ),
  };
  saveOrgStore(next);
  return { store: next };
}

/** 更新成员登录密码 */
export function updateMemberPassword(
  store: OrgStore,
  memberId: string,
  passwordPlain: string
): { store: OrgStore; error?: string } {
  const pwd = passwordPlain.trim();
  if (pwd.length < 6) return { store, error: "密码至少 6 位" };
  if (!store.members.some((m) => m.id === memberId)) return { store, error: "成员不存在" };
  const next: OrgStore = {
    ...store,
    members: store.members.map((m) => (m.id === memberId ? { ...m, passwordPlain: pwd } : m)),
  };
  saveOrgStore(next);
  return { store: next };
}

export function listOuOptions(
  store: OrgStore
): { id: string; name: string; depth: number; level?: OuAdminLevel }[] {
  const out: { id: string; name: string; depth: number; level?: OuAdminLevel }[] = [];
  function walk(parentId: string | null, depth: number) {
    const children = getChildren(store, parentId).sort((a, b) => a.name.localeCompare(b.name, "zh"));
    for (const c of children) {
      const level = getOuAdminLevel(store, c.id) ?? undefined;
      const indent = depth > 0 ? `${"— ".repeat(depth)}` : "";
      const prefix = level ? `${level} · ` : "";
      out.push({ id: c.id, name: `${indent}${prefix}${c.name}`, depth, level });
      walk(c.id, depth + 1);
    }
  }
  const root = store.units.find((u) => u.id === store.organization.rootOuId);
  if (root) {
    out.push({ id: root.id, name: root.name, depth: 0 });
    walk(root.id, 1);
  }
  return out;
}

export type OuCascadePath = {
  cityId: string;
  countyId: string;
  districtId: string;
};

/** 向上找到 Root 下的直接子节点（市） */
export function findCityOuForLeaf(store: OrgStore, ouId: string): OrgUnit | undefined {
  let cur = getUnit(store, ouId);
  while (cur) {
    if (cur.parentId === store.organization.rootOuId) return cur;
    if (!cur.parentId) break;
    cur = getUnit(store, cur.parentId);
  }
  return undefined;
}

/** 判断 unit 是否在 cityId 的子树内 */
function isUnderCity(store: OrgStore, unitId: string, cityId: string): boolean {
  let cur = getUnit(store, unitId);
  while (cur) {
    if (cur.id === cityId) return true;
    cur = cur.parentId ? getUnit(store, cur.parentId) : undefined;
  }
  return false;
}

/** Root 下第一级 = 市；其下 = 县；再下 = 区（按树结构，兼容旧数据） */
export function listCityOus(store: OrgStore): OrgUnit[] {
  return getChildren(store, store.organization.rootOuId).sort((a, b) =>
    a.name.localeCompare(b.name, "zh")
  );
}

/** 新建/邀请成员默认挂载 OU：操作者所在单元；主账号在 Root 时取第一个市级单元 */
export function resolveDefaultMemberOuId(
  store: OrgStore,
  user?: AuthUser | null
): string | null {
  const rootId = store.organization.rootOuId;
  const ms = findMembershipByUserId(store, user?.userId);
  if (ms?.ouId && ms.ouId !== rootId) return ms.ouId;
  return listCityOus(store)[0]?.id ?? null;
}

export function listCountyOus(store: OrgStore, cityId: string): OrgUnit[] {
  if (!cityId || !getUnit(store, cityId)) return [];
  const direct = getChildren(store, cityId);
  if (direct.length) return direct.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return store.units
    .filter((u) => getUnitDepth(store, u.id) === 2 && isUnderCity(store, u.id, cityId))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

export function listDistrictOus(store: OrgStore, countyId: string): OrgUnit[] {
  if (!countyId || !getUnit(store, countyId)) return [];
  const direct = getChildren(store, countyId);
  if (direct.length) return direct.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return store.units
    .filter((u) => getUnitDepth(store, u.id) >= 3 && isUnderCity(store, u.id, countyId))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

/** 从 Root 到 leaf 的祖先链（不含 Root） */
export function ouChainFromRoot(store: OrgStore, leafOuId: string): OrgUnit[] {
  const rootId = store.organization.rootOuId;
  if (!leafOuId || leafOuId === rootId) return [];
  const chain: OrgUnit[] = [];
  let cur = getUnit(store, leafOuId);
  while (cur && cur.id !== rootId) {
    chain.unshift(cur);
    cur = cur.parentId ? getUnit(store, cur.parentId) : undefined;
  }
  return chain;
}

/** 从成员当前挂载 OU 反解市 / 县 / 区（Root 下链路第 1/2/3 级） */
export function resolveOuCascadeFromLeaf(store: OrgStore, leafOuId: string): OuCascadePath {
  const path = { cityId: "", countyId: "", districtId: "" };
  if (!leafOuId || leafOuId === store.organization.rootOuId) return path;
  if (!getUnit(store, leafOuId)) return path;

  const chain = ouChainFromRoot(store, leafOuId);
  if (chain[0]) path.cityId = chain[0].id;
  if (chain[1]) path.countyId = chain[1].id;
  if (chain[2]) path.districtId = chain[2].id;
  return path;
}

/** 市 / 县 / 区选择合成最终挂载 OU（取最深层已选项） */
export function resolveLeafOuFromCascade(store: OrgStore, path: OuCascadePath): string | null {
  if (path.districtId && getUnit(store, path.districtId)) return path.districtId;
  if (path.countyId && getUnit(store, path.countyId)) return path.countyId;
  if (path.cityId && getUnit(store, path.cityId)) return path.cityId;
  return null;
}

export function quotaUsage(store: OrgStore) {
  return {
    depth: Math.max(0, ...store.units.map((u) => getUnitDepth(store, u.id))),
    accounts: store.memberships.length,
    units: store.units.length,
    policies: store.policies.filter((p) => !p.system).length,
  };
}
