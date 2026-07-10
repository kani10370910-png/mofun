// 前端解析上传的剧本文件为纯文本，用于「① 脚本编辑」直接导入。
// 支持情况：
//   - txt / md / csv：可靠（按文本读取，自动判 UTF-8）
//   - docx：可靠（用浏览器原生 DecompressionStream 解压 zip，取 word/document.xml 文本）
//   - pdf / doc：中文文档需专门解析库（CID 字体 / 二进制格式，纯前端手写会乱码），
//     这里不做“会乱码的尽力而为”，而是抛出清晰提示，引导用户转成 txt/docx 或直接粘贴。

export type ParsedDoc = { text: string; note?: string };

// 用原生 DecompressionStream 解压 raw deflate（zip 条目 method=8 用的是 raw deflate）
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error("当前浏览器不支持解压 docx，请升级浏览器或改用 txt");
  const stream = new Blob([data]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 从 zip（ArrayBuffer）中取出指定文件名的原始字节。走中央目录，尺寸信息最可靠。
async function readZipEntry(buf: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  // 从末尾往前找 EOCD 签名 0x06054b50
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const cdCount = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true); // 中央目录起始偏移
  const dec = new TextDecoder();
  for (let n = 0; n < cdCount; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lfhOffset = dv.getUint32(p + 42, true);
    const fname = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (fname === name) {
      // 用 local file header 定位真正的数据起点（extra 字段长度本地与中央可能不同）
      const lNameLen = dv.getUint16(lfhOffset + 26, true);
      const lExtraLen = dv.getUint16(lfhOffset + 28, true);
      const dataStart = lfhOffset + 30 + lNameLen + lExtraLen;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return comp; // 未压缩
      if (method === 8) return await inflateRaw(comp); // deflate
      throw new Error("docx 使用了不支持的压缩方式，请另存为 txt 后上传");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

async function parseDocx(file: File): Promise<ParsedDoc> {
  const buf = await file.arrayBuffer();
  const xmlBytes = await readZipEntry(buf, "word/document.xml");
  if (!xmlBytes) throw new Error("这不是有效的 docx 文件（缺 document.xml），请检查文件");
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const text = xml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t") // 制表符
    .replace(/<w:br\b[^>]*\/?>/g, "\n") // 手动换行
    .replace(/<\/w:p>/g, "\n") // 段落结束 → 换行
    .replace(/<[^>]+>/g, "") // 去掉所有 XML 标签
    .replace(/\r/g, "");
  return { text: decodeEntities(text).replace(/\n{3,}/g, "\n\n").trim() };
}

async function parseTxt(file: File): Promise<ParsedDoc> {
  // File.text() 按 UTF-8 解码，覆盖绝大多数场景
  const text = (await file.text()).replace(/\r\n?/g, "\n").trim();
  return { text };
}

// 解析入口：按扩展名分发。pdf/doc 抛清晰错误由调用方 toast。
export async function parseScriptFile(file: File): Promise<ParsedDoc> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "text") return parseTxt(file);
  if (ext === "docx") return parseDocx(file);
  if (ext === "pdf") {
    throw new Error("PDF 直接解析中文易乱码，请先转成 TXT 或 DOCX 再上传（或把内容粘贴到右侧框）");
  }
  if (ext === "doc") {
    throw new Error("旧版 .doc 为二进制格式，请在 Word 里「另存为 .docx」后上传（或粘贴内容）");
  }
  // 兜底：尝试按文本读取（未知扩展名但其实是纯文本时也能用）
  const { text } = await parseTxt(file);
  if (!text) throw new Error("不支持的文件格式，请上传 TXT 或 DOCX");
  return { text, note: "按纯文本读取" };
}
