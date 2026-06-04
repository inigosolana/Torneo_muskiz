import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ttf = path.join(root, "supabase/functions/_shared/fonts/DejaVuSans-Bold.ttf");
const out = path.join(root, "supabase/functions/_shared/previewFontData.ts");

const b64 = fs.readFileSync(ttf).toString("base64");
const content = [
  "/** Auto-generated DejaVu Sans Bold */",
  `export const PREVIEW_FONT_B64 = ${JSON.stringify(b64)};`,
  "",
  "export function decodePreviewFont(): Uint8Array {",
  "  const bin = atob(PREVIEW_FONT_B64);",
  "  const u = new Uint8Array(bin.length);",
  "  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);",
  "  return u;",
  "}",
  "",
].join("\n");

fs.writeFileSync(out, content, "utf8");
console.log("ok", content.length);
