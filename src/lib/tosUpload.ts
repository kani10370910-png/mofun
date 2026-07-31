/* 火山 TOS 对象存储上传（手写 TOS4-HMAC-SHA256 签名，直接 fetch，不用 SDK —— 规避 Next 打包把 SDK 解析成 browser 版导致 ERR_INVALID_PROTOCOL）。
   用途：OmniHuman 数字人对口型要求 image_url/audio_url 为公网可访问地址（base64 提交无效），
   且火山云端只能稳定拉取同云资源 —— 故上传到火山 TOS（cn-beijing，与 OmniHuman 同区域）。
   凭证复用 VOLC_ACCESS_KEY / VOLC_SECRET_KEY；桶名/区域可用 VOLC_TOS_* 覆盖，默认自动建公读桶。
   签名与 volcSign.ts(cv 服务) 同族：派生密钥不加前缀、终止串 "request"；算法标签 TOS4-HMAC-SHA256、服务名 tos、头用 x-tos-*。 */
import crypto from "node:crypto";

const REGION = process.env.VOLC_TOS_REGION || "cn-beijing";
const HOST = (process.env.VOLC_TOS_ENDPOINT || `tos-${REGION}.volces.com`).replace(/^https?:\/\//, "");
const BUCKET = process.env.VOLC_TOS_BUCKET || "mofun-digital-human-media";

export function tosCredsPresent(): boolean {
  return !!(process.env.VOLC_ACCESS_KEY && process.env.VOLC_SECRET_KEY);
}

const sha256Hex = (d: crypto.BinaryLike) => crypto.createHash("sha256").update(d).digest("hex");
const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data).digest();
function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
// 对象 key 编码：逐段 RFC3986 编码，保留 "/"
function encodeKeyPath(key: string): string {
  return "/" + key.split("/").map(encodeRfc3986).join("/");
}

/** 发起一次已签名的 TOS 请求（虚拟主机风格：<bucket>.<host>）。canonicalURI 由 path 决定。 */
async function tosRequest(
  method: "PUT" | "HEAD" | "GET",
  path: string,
  body: Buffer,
  extraHeaders: Record<string, string>,
): Promise<Response> {
  const ak = process.env.VOLC_ACCESS_KEY || "";
  const sk = process.env.VOLC_SECRET_KEY || "";
  if (!ak || !sk) throw new Error("缺少 VOLC_ACCESS_KEY / VOLC_SECRET_KEY");
  const host = `${BUCKET}.${HOST}`;
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = xDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  // 待签名头：host + x-tos-date + x-tos-content-sha256 + 额外头（content-type / x-tos-acl 等）
  const headers: Record<string, string> = {
    host,
    "x-tos-date": xDate,
    "x-tos-content-sha256": payloadHash,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${REGION}/tos/request`;
  const stringToSign = ["TOS4-HMAC-SHA256", xDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(sk, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, "tos");
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `TOS4-HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // host 由 undici 依 URL 自动设置（且禁止手动覆盖），故从发送头里剔除，仅用于签名
  const sendHeaders: Record<string, string> = { Authorization: authorization };
  for (const k of sortedKeys) if (k !== "host") sendHeaders[k] = headers[k];
  return fetch(`https://${host}${path}`, {
    method,
    headers: sendHeaders,
    body: method === "HEAD" || method === "GET" ? undefined : new Uint8Array(body),
    signal: AbortSignal.timeout(120_000),
  });
}

let _bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (_bucketReady) return;
  // 桶已存在且属于本账号 → HeadBucket 200
  const head = await tosRequest("HEAD", "/", Buffer.alloc(0), {});
  if (head.ok) { _bucketReady = true; return; }
  if (head.status !== 404) {
    throw new Error(`TOS 桶「${BUCKET}」不可用（HTTP ${head.status}）：可能被他人占用或该账号无 TOS 权限，请在 .env.local 设 VOLC_TOS_BUCKET 换个全局唯一的桶名。`);
  }
  // 不存在 → 创建公读桶
  const create = await tosRequest("PUT", "/", Buffer.alloc(0), { "x-tos-acl": "public-read" });
  if (!create.ok) {
    const t = await create.text().catch(() => "");
    throw new Error(`创建 TOS 公读桶「${BUCKET}」失败（HTTP ${create.status}）：${t.slice(0, 300)}`);
  }
  _bucketReady = true;
}

/** 上传 buffer 到公读 TOS，返回公网可访问的 https URL。 */
export async function tosUploadPublic(body: Buffer, key: string, contentType: string): Promise<string> {
  await ensureBucket();
  const res = await tosRequest("PUT", encodeKeyPath(key), body, {
    "content-type": contentType,
    "x-tos-acl": "public-read",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`上传对象到 TOS 失败（HTTP ${res.status}）：${t.slice(0, 300)}`);
  }
  return `https://${BUCKET}.${HOST}/${key}`;
}
