/* 火山引擎「访问控制 Access Key」V4 签名 —— 用于视觉智能 OpenAPI（visual.volcengineapi.com）。
   与 AWS SigV4 类似，但派生签名密钥不加 "AWS4" 前缀、终止串用 "request"（非 "aws4_request"）。
   凭证来自控制台「API 访问密钥 → Access Key」：VOLC_ACCESS_KEY / VOLC_SECRET_KEY（服务端读取，不外泄）。 */
import crypto from "node:crypto";

const HOST = "visual.volcengineapi.com";
const SERVICE = "cv";
const REGION = "cn-north-1";
const ALGO = "HMAC-SHA256";

const sha256Hex = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data).digest();

// 时间戳：YYYYMMDDTHHMMSSZ（UTC，basic ISO8601）
function amzDate(d: Date): { xDate: string; dateStamp: string } {
  const s = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { xDate: s, dateStamp: s.slice(0, 8) };
}

// canonical query：按 key 排序、逐字段 RFC3986 编码
function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(params[k])}`)
    .join("&");
}
function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** 发起一次已签名的火山视觉智能 POST 请求。
    action/version 走 query，body 为 JSON 对象；返回 fetch Response。 */
export async function volcVisualRequest(
  action: string,
  version: string,
  body: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<Response> {
  const ak = process.env.VOLC_ACCESS_KEY || "";
  const sk = process.env.VOLC_SECRET_KEY || "";
  if (!ak || !sk) throw new Error("缺少 VOLC_ACCESS_KEY / VOLC_SECRET_KEY（在 .env.local 配置火山引擎 Access Key）");

  const payload = JSON.stringify(body ?? {});
  const { xDate, dateStamp } = amzDate(new Date());
  const query = { Action: action, Version: version };
  const contentType = "application/json";
  const payloadHash = sha256Hex(payload);

  // 1) canonical request
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // 2) string to sign
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/request`;
  const stringToSign = [ALGO, xDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  // 3) 派生签名密钥（火山：不加 AWS4 前缀，终止串 "request"）
  const kDate = hmac(sk, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization =
    `${ALGO} Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${HOST}/?Action=${encodeRfc3986(action)}&Version=${encodeRfc3986(version)}`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Host: HOST,
      "X-Date": xDate,
      "X-Content-Sha256": payloadHash,
      Authorization: authorization,
    },
    body: payload,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
}
