import type { AuthUser } from "@/lib/auth";

export type IdentityKind = "personal" | "owned" | "joined";

export type WorkIdentity = {
  id: string;
  kind: IdentityKind;
  name: string;
  companyId: string;
  roleLabel: string;
  planLabel: string;
};

export type IdentityBook = {
  phone: string;
  lastId: string;
  identities: WorkIdentity[];
};

export const IDENTITY_EVENT = "mofun-identity-change";

const BOOK_KEY = "mofun.identity.book.v1";

let activeId = "";

export function activeIdentityId() {
  return activeId;
}

export function setActiveIdentityId(id: string) {
  const next = (id || "").trim();
  if (activeId === next) return;
  activeId = next;
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    try {
      window.dispatchEvent(new Event(IDENTITY_EVENT));
    } catch {
      /* ignore */
    }
  });
}

export function personalIdentityId(userId: string) {
  return `personal:${userId}`;
}

export function ownedIdentityId(companyId: string) {
  return `owned:${companyId}`;
}

export function joinedIdentityId(companyId: string) {
  return `joined:${companyId}`;
}

export function isPersonalIdentityId(id: string) {
  return !id || id.startsWith("personal:");
}

function bookKey(phone: string) {
  return `${BOOK_KEY}:${phone}`;
}

function emptyBook(phone: string): IdentityBook {
  return { phone, lastId: "", identities: [] };
}

function readBook(phone: string): IdentityBook {
  if (typeof window === "undefined" || !phone) return emptyBook(phone);
  try {
    const raw = window.localStorage.getItem(bookKey(phone));
    if (!raw) return emptyBook(phone);
    const parsed = JSON.parse(raw) as IdentityBook;
    if (!parsed || !Array.isArray(parsed.identities)) return emptyBook(phone);
    return {
      phone,
      lastId: String(parsed.lastId || ""),
      identities: parsed.identities.filter((x) => x && x.id && x.kind),
    };
  } catch {
    return emptyBook(phone);
  }
}

function writeBook(book: IdentityBook) {
  if (typeof window === "undefined" || !book.phone) return;
  try {
    window.localStorage.setItem(bookKey(book.phone), JSON.stringify(book));
  } catch {
    /* ignore quota */
  }
}

export function phoneOf(user: AuthUser | null | undefined) {
  return (user?.phone || user?.username || "").trim();
}

function personalName(user: AuthUser) {
  const nick = (user.nickname || "").trim();
  if (nick && !/^1\d{10}$/.test(nick) && nick !== `用户${(user.phone || "").slice(-4)}`) return nick;
  return "个人空间";
}

function ensurePersonal(book: IdentityBook, user: AuthUser): IdentityBook {
  const id = personalIdentityId(user.userId);
  const name = personalName(user);
  const hit = book.identities.find((x) => x.kind === "personal");
  if (hit) {
    return {
      ...book,
      identities: book.identities.map((x) =>
        x.kind === "personal" ? { ...x, id, name, companyId: x.companyId || `PER-${user.userId.slice(-6)}`, roleLabel: "个人", planLabel: "个人版" } : x,
      ),
    };
  }
  return {
    ...book,
    identities: [
      {
        id,
        kind: "personal",
        name,
        companyId: `PER-${user.userId.slice(-6)}`,
        roleLabel: "个人",
        planLabel: "个人版",
      },
      ...book.identities,
    ],
  };
}

/** 把旧的「整号个人/企业互斥」迁成身份清单 */
export function bootstrapIdentities(user: AuthUser): IdentityBook {
  const phone = phoneOf(user);
  let book = ensurePersonal(readBook(phone), user);
  if (user.enterpriseVerified && !user.joinedOrg) {
    const companyId =
      (user.companyId || "").trim() ||
      (user.phone && /^1\d{10}$/.test(user.phone) ? `ENT-${user.phone.slice(-8)}` : `ENT-${user.userId.slice(-8)}`);
    const name = (user.company || user.orgName || "我的企业").trim();
    if (!book.identities.some((x) => x.kind === "owned")) {
      book = {
        ...book,
        identities: [
          ...book.identities,
          {
            id: ownedIdentityId(companyId),
            kind: "owned",
            name,
            companyId,
            roleLabel: "管理员",
            planLabel: "企业版",
          },
        ],
      };
    }
    if (!book.lastId) book = { ...book, lastId: ownedIdentityId(companyId) };
  }
  if (user.joinedOrg) {
    const companyId = (user.companyId || "").trim() || `JOIN-${user.userId.slice(-8)}`;
    const name = (user.company || user.orgName || "已加入企业").trim();
    if (!book.identities.some((x) => x.kind === "joined" && x.companyId === companyId)) {
      book = {
        ...book,
        identities: [
          ...book.identities,
          {
            id: joinedIdentityId(companyId),
            kind: "joined",
            name,
            companyId,
            roleLabel: "成员",
            planLabel: "企业版",
          },
        ],
      };
    }
    if (!book.lastId) book = { ...book, lastId: joinedIdentityId(companyId) };
  }
  const personal = book.identities.find((x) => x.kind === "personal");
  if (!book.lastId || !book.identities.some((x) => x.id === book.lastId)) {
    book = { ...book, lastId: personal?.id || "" };
  }
  writeBook(book);
  setActiveIdentityId(book.lastId);
  return book;
}

export function loadIdentities(user: AuthUser | null | undefined): WorkIdentity[] {
  if (!user) return [];
  return bootstrapIdentities(user).identities;
}

export function currentIdentity(user: AuthUser | null | undefined): WorkIdentity | null {
  if (!user) return null;
  const book = bootstrapIdentities(user);
  return book.identities.find((x) => x.id === book.lastId) || book.identities.find((x) => x.kind === "personal") || null;
}

export function canCreateOwnedEnterprise(user: AuthUser | null | undefined) {
  if (!user) return false;
  return !bootstrapIdentities(user).identities.some((x) => x.kind === "owned");
}

export function addOwnedIdentity(user: AuthUser, input: { name: string; companyId: string }): WorkIdentity {
  const phone = phoneOf(user);
  let book = ensurePersonal(readBook(phone), user);
  if (book.identities.some((x) => x.kind === "owned")) {
    const existing = book.identities.find((x) => x.kind === "owned")!;
    book = { ...book, lastId: existing.id };
    writeBook(book);
    setActiveIdentityId(existing.id);
    return existing;
  }
  const ident: WorkIdentity = {
    id: ownedIdentityId(input.companyId),
    kind: "owned",
    name: input.name.trim() || "我的企业",
    companyId: input.companyId,
    roleLabel: "管理员",
    planLabel: "企业版",
  };
  book = { ...book, lastId: ident.id, identities: [...book.identities, ident] };
  writeBook(book);
  setActiveIdentityId(ident.id);
  return ident;
}

export function addJoinedIdentity(user: AuthUser, input: { name: string; companyId: string }): WorkIdentity {
  const phone = phoneOf(user);
  let book = ensurePersonal(readBook(phone), user);
  const id = joinedIdentityId(input.companyId);
  const existing = book.identities.find((x) => x.id === id);
  if (existing) {
    book = { ...book, lastId: existing.id };
    writeBook(book);
    setActiveIdentityId(existing.id);
    return existing;
  }
  const ident: WorkIdentity = {
    id,
    kind: "joined",
    name: input.name.trim() || "已加入企业",
    companyId: input.companyId,
    roleLabel: "成员",
    planLabel: "企业版",
  };
  book = { ...book, lastId: ident.id, identities: [...book.identities, ident] };
  writeBook(book);
  setActiveIdentityId(ident.id);
  return ident;
}

export function removeIdentity(user: AuthUser, identityId: string): WorkIdentity | null {
  const phone = phoneOf(user);
  let book = ensurePersonal(readBook(phone), user);
  const target = book.identities.find((x) => x.id === identityId);
  if (!target || target.kind === "personal") return currentIdentity(user);
  book = {
    ...book,
    identities: book.identities.filter((x) => x.id !== identityId),
    lastId: book.lastId === identityId ? personalIdentityId(user.userId) : book.lastId,
  };
  if (!book.identities.some((x) => x.id === book.lastId)) {
    book.lastId = personalIdentityId(user.userId);
  }
  writeBook(book);
  setActiveIdentityId(book.lastId);
  return book.identities.find((x) => x.id === book.lastId) || null;
}

export function switchIdentity(user: AuthUser, identityId: string): WorkIdentity | null {
  const phone = phoneOf(user);
  const book = ensurePersonal(readBook(phone), user);
  const ident = book.identities.find((x) => x.id === identityId);
  if (!ident) return currentIdentity(user);
  writeBook({ ...book, lastId: ident.id });
  setActiveIdentityId(ident.id);
  return ident;
}

export function identityUserPatch(user: AuthUser, ident: WorkIdentity): Partial<AuthUser> {
  if (ident.kind === "personal") {
    return {
      enterpriseVerified: false,
      joinedOrg: false,
      company: "",
      companyId: ident.companyId,
      orgName: ident.name,
      planLabel: "个人版",
      roleBadge: "个人版",
      roleTitle: "个人用户",
      memberCount: "1/1",
    };
  }
  if (ident.kind === "owned") {
    return {
      enterpriseVerified: true,
      joinedOrg: false,
      company: ident.name,
      orgName: ident.name,
      companyId: ident.companyId,
      planLabel: "企业版",
      roleBadge: "企业版",
      roleTitle: "企业管理员",
    };
  }
  return {
    enterpriseVerified: false,
    joinedOrg: true,
    company: ident.name,
    orgName: ident.name,
    companyId: ident.companyId,
    planLabel: "企业版",
    roleBadge: "企业版",
    roleTitle: "成员账号",
  };
}

export function applyCurrentIdentity(user: AuthUser): AuthUser {
  const ident = currentIdentity(user);
  if (!ident) return user;
  return { ...user, ...identityUserPatch(user, ident) };
}

/** 钱包 / 资产隔离键：个人沿用 userId，其它身份用 identity.id */
export function identityScopeKey(user: AuthUser | null | undefined): string {
  if (!user) return "guest";
  const ident = currentIdentity(user);
  if (!ident || ident.kind === "personal") return user.userId;
  return ident.id;
}

export function identityKindLabel(kind: IdentityKind) {
  if (kind === "personal") return "个人空间";
  if (kind === "owned") return "自建企业";
  return "加入的企业";
}

/** 运营端租户 code：个人=手机号，自建=E手机号，加入=J手机号-企业尾号 */
export function opsTenantCode(user: AuthUser | null | undefined): string {
  const phone = phoneOf(user);
  if (!phone) return "";
  const ident = currentIdentity(user);
  if (!ident || ident.kind === "personal") return phone;
  if (ident.kind === "owned") return `E${phone}`;
  const tail = ident.companyId.replace(/\W/g, "").slice(-8) || "join";
  return `J${phone}-${tail}`;
}

export function identityScopedStorageKey(base: string, user?: AuthUser | null) {
  const scope = user ? identityScopeKey(user) : activeIdentityId();
  if (!scope || isPersonalIdentityId(scope) || scope === (user?.userId || "")) return base;
  return `${base}::${scope}`;
}

export function readIdentityScopedItem(base: string, user?: AuthUser | null): string | null {
  if (typeof window === "undefined") return null;
  const scoped = identityScopedStorageKey(base, user);
  const hit = window.localStorage.getItem(scoped);
  if (hit != null) return hit;
  if (scoped === base) return null;
  return null;
}

export function writeIdentityScopedItem(base: string, value: string, user?: AuthUser | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(identityScopedStorageKey(base, user), value);
}
