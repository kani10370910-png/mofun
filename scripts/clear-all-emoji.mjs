import fs from "fs";
import path from "path";

const root = path.resolve("src");

/** Decorative / presentation emoji (not basic punctuation) */
const EMOJI =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}))*/gu;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", ".next"].includes(ent.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function stripEmoji(s) {
  return s.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").replace(/ ?([，。！？、；：])/g, "$1");
}

const files = walk(root);
let n = 0;
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const orig = s;

  // Property values that are typically emoji icons
  for (const key of ["emoji", "ico", "logo"]) {
    s = s.replace(new RegExp(`${key}:\\s*(["'\`])(?:(?!\\1)[\\s\\S])*?\\1`, "g"), (m, q) => {
      const inner = m.slice(m.indexOf(q) + 1, -1);
      if (!EMOJI.test(inner) && inner !== "") {
        EMOJI.lastIndex = 0;
        // keep non-emoji string values (e.g. icon component names)
        if (!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(inner)) return m;
      }
      EMOJI.lastIndex = 0;
      return `${key}: ""`;
    });
  }

  // ASSET emoji maps / arrays → empty
  s = s.replace(
    /const ASSET_EMOJIS\s*=\s*\[[^\]]*\]/g,
    "const ASSET_EMOJIS = []",
  );
  s = s.replace(
    /const ASSET_KIND_EMOJI:[^=]*=\s*\{[^}]*\}/g,
    'const ASSET_KIND_EMOJI: Record<string, string> = { 场景: "", 角色: "", 道具: "" }',
  );

  // Fallback emoji in templates: || "🖼️" → || ""
  s = s.replace(/\|\|\s*(["'`])(?:(?!\1)[\s\S])*?\1/g, (m, q) => {
    const inner = m.slice(m.indexOf(q) + 1, -1);
    EMOJI.lastIndex = 0;
    if (EMOJI.test(inner) && stripEmoji(inner).trim() === "") return '|| ""';
    EMOJI.lastIndex = 0;
    return m;
  });

  // Strip emoji from string literals (keep string if only whitespace left)
  s = s.replace(/(["'`])(?:(?!\1)[\s\S])*?\1/g, (m) => {
    // skip import paths and regex-like
    if (m.includes("/") && !EMOJI.test(m)) return m;
    EMOJI.lastIndex = 0;
    if (!EMOJI.test(m)) return m;
    EMOJI.lastIndex = 0;
    const q = m[0];
    const inner = m.slice(1, -1);
    const cleaned = stripEmoji(inner);
    // If toast was only emoji + text, keep text; if only emoji, empty
    return q + cleaned + q;
  });

  // JSX text nodes with lone emoji between tags: >🎨< → ><
  s = s.replace(/>([^<>{}]*)</g, (m, inner) => {
    EMOJI.lastIndex = 0;
    if (!EMOJI.test(inner)) return m;
    EMOJI.lastIndex = 0;
    return ">" + stripEmoji(inner) + "<";
  });

  if (s !== orig) {
    fs.writeFileSync(f, s);
    n++;
    console.log("cleaned:", path.relative(process.cwd(), f));
  }
}
console.log("files changed:", n);
