/**
 * One-off audit: model selection → compute points.
 * Run: npx tsx --tsconfig tsconfig.json scripts/audit-point-costs.ts
 */
import {
  videoSecondsPoints,
  imageShotPoints,
  eventImagePoints,
  videoYuanPerSecond,
  multiImagePoints,
} from "../src/lib/pointCosts";
import { videoModels } from "../src/data/video";
import { imageModels, editModels } from "../src/data/image";

const rows: string[] = [];
const log = (s: string) => {
  rows.push(s);
  console.log(s);
};

log("=== VIDEO 5s×1 (silent / audio) ===");
for (const m of videoModels) {
  for (const q of m.qualities) {
    const silent = videoSecondsPoints(5, { model: m.name, quality: q, withAudio: false });
    const audio = videoSecondsPoints(5, { model: m.name, quality: q, withAudio: true });
    const yuanA = videoYuanPerSecond({ model: m.modelId, quality: q, withAudio: true });
    const yuanS = videoYuanPerSecond({ model: m.modelId, quality: q, withAudio: false });
    log(
      `${m.name.padEnd(20)} ${q.padEnd(6)} silent=${String(silent).padStart(4)} (${yuanS.toFixed(3)}¥/s)  audio=${String(audio).padStart(4)} (${yuanA.toFixed(3)}¥/s)`,
    );
  }
}

log("");
log("=== IMAGE t2i models ===");
for (const m of imageModels) {
  log(`${m.name.padEnd(24)} 1张=${imageShotPoints(m.name)}  4张=${eventImagePoints("t2i", 4, m.name)}`);
}

log("");
log("=== IMAGE i2i edit models ===");
for (const m of editModels) {
  log(`${m.name.padEnd(24)} i2i=${eventImagePoints("i2i", 1, m.name)}`);
}

log("");
log("=== Product/Signage channel id ===");
log(`Seedream-5.0-lite ×1 = ${multiImagePoints(1, "Seedream-5.0-lite")}`);
log(`Seedream-5.0-lite ×4 = ${multiImagePoints(4, "Seedream-5.0-lite")}`);

log("");
log("=== Defaults / wiring samples ===");
log(`videoSecondsPoints(5) no opts = ${videoSecondsPoints(5)}  (expect 1.5Pro 720 silent=86)`);
log(
  `Oneline UI default 1.5Pro 480P audio 5s = ${videoSecondsPoints(5, { model: "Seedance 1.5 Pro", quality: "480P", withAudio: true })}`,
);
log(
  `Oneline 2条 = ${videoSecondsPoints(5, { model: "Seedance 1.5 Pro", quality: "480P", withAudio: true, count: 2 })}`,
);
log(
  `Studio 1.5Pro 480P 配音开 5s = ${videoSecondsPoints(5, { model: "Seedance 1.5 Pro", quality: "480P", withAudio: true })}`,
);
log(
  `2.0 2K→1080 audio same as 1080 = ${videoSecondsPoints(5, { model: "Seedance 2.0", quality: "2K", withAudio: true })} vs ${videoSecondsPoints(5, { model: "Seedance 2.0", quality: "1080P", withAudio: true })}`,
);

// Official Volcengine 5s samples for 1.5 Pro
const official = [
  ["480P", true, 0.8],
  ["720P", true, 1.73],
  ["1080P", true, 3.89],
  ["480P", false, 0.4],
  ["720P", false, 0.86],
  ["1080P", false, 1.94],
] as const;
log("");
log("=== vs 火山方舟 1.5 Pro 5s 刊例 ===");
for (const [q, audio, yuan5] of official) {
  const got = videoSecondsPoints(5, { model: "Seedance 1.5 Pro", quality: q, withAudio: audio });
  const expect = Math.ceil(yuan5 * 100 - 1e-9);
  const ok = got === expect ? "OK" : `MISMATCH expect ${expect}`;
  log(`1.5Pro ${q} ${audio ? "有声" : "无声"} 刊例${yuan5}元 → 算力${expect}  实算${got}  ${ok}`);
}

// 2.0 official 5s
const o20 = [
  ["Seedance 2.0", "480P", 2.31],
  ["Seedance 2.0", "720P", 4.97],
  ["Seedance 2.0", "1080P", 12.39],
  ["Seedance 2.0 Fast", "480P", 1.86],
  ["Seedance 2.0 Fast", "720P", 4.0],
  ["Seedance 2.0 Mini", "480P", 1.16],
  ["Seedance 2.0 Mini", "720P", 2.48],
] as const;
log("");
log("=== vs 火山方舟 2.0 系列 5s 刊例（输入不含视频） ===");
for (const [name, q, yuan5] of o20) {
  const got = videoSecondsPoints(5, { model: name, quality: q, withAudio: true });
  const expect = Math.ceil(yuan5 * 100 - 1e-9);
  const ok = got === expect ? "OK" : `MISMATCH expect ${expect}`;
  log(`${name} ${q} 刊例${yuan5}元 → ${expect}  实算${got}  ${ok}`);
}
