/* 极简 ZIP 打包（store 模式，无压缩，无依赖）。
   仅用于前端把若干文本/二进制文件打包成 .zip 下载，满足演示「下载压缩包」需求。 */

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// CRC32 查表
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** 把若干文件打成一个 ZIP（store 模式）Blob */
export function makeZip(files: { name: string; content: string | Uint8Array }[]): Blob {
  const entries: ZipEntry[] = files.map((f) => ({
    name: f.name,
    data: typeof f.content === "string" ? strToBytes(f.content) : f.content,
  }));

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = strToBytes(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    // 本地文件头
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // 签名
    lh.setUint16(4, 20, true); // version
    lh.setUint16(6, 0, true); // flags
    lh.setUint16(8, 0, true); // 压缩方式 0=store
    lh.setUint16(10, 0, true); // 时间
    lh.setUint16(12, 0, true); // 日期
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true); // extra len
    const lhBytes = new Uint8Array(lh.buffer);

    chunks.push(lhBytes, nameBytes, e.data);

    // 中央目录项
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameBytes);

    offset += lhBytes.length + nameBytes.length + e.data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;

  // 结束记录
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, centralStart, true);
  eocd.setUint16(20, 0, true);

  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], { type: "application/zip" });
}
