import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "phone2region", "phone.dat");
const destDir = join(root, "public");
const dest = join(destDir, "phone.dat");

if (!existsSync(src)) {
  console.warn("[copy-phone-dat] skip: phone2region/phone.dat not found");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[copy-phone-dat] copied to public/phone.dat");
