import fs from "fs";
import path from "path";

const root = path.resolve("src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
let changedFiles = 0;
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const orig = s;
  // Clear emoji: "..." / '...' / `...` property values
  s = s.replace(/emoji:\s*(["'`])(?:(?!\1)[\s\S])*?\1/g, 'emoji: ""');
  if (s !== orig) {
    fs.writeFileSync(f, s);
    changedFiles++;
    console.log("cleared emoji props:", path.relative(process.cwd(), f));
  }
}
console.log("done props", changedFiles);
