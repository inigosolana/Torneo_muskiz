/**
 * Genera imagen JPEG de vista previa para Instagram (Telegram).
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const FONT_URL =
  "https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/version_2_37/ttf/DejaVuSans-Bold.ttf";

let cachedFont: Uint8Array | null = null;

async function loadFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error("Font load failed");
  cachedFont = new Uint8Array(await res.arrayBuffer());
  return cachedFont;
}

async function fetchImage(url: string, maxSize: number): Promise<Image | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let img = await Image.decode(bytes);
    if (img.width > maxSize || img.height > maxSize) {
      const scale = maxSize / Math.max(img.width, img.height);
      img = img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
    }
    return img;
  } catch {
    return null;
  }
}

async function drawText(
  img: Image,
  font: Uint8Array,
  size: number,
  text: string,
  x: number,
  y: number,
  color = 0xffffffff,
): Promise<number> {
  const line = text.slice(0, 48);
  const t = await Image.renderText(font, size, line, color);
  img.composite(t, x, y);
  return t.height;
}

function targetSize(payload: Record<string, unknown>): { w: number; h: number } {
  const fmt = payload.format as { width?: number; height?: number } | undefined;
  const w = fmt?.width ?? 1080;
  const h = fmt?.height ?? 1920;
  return { w, h };
}

export async function renderPayloadPreviewImage(
  payload: Record<string, unknown>,
): Promise<Uint8Array> {
  const { w, h } = targetSize(payload);
  const font = await loadFont();
  const brand = payload.brand as { logoUrl?: string; title?: string } | undefined;
  const stitch = payload.stitch as Record<string, unknown> | undefined;

  let canvas = new Image(w, h, 0x0b0f14ff);
  const accent = new Image(w, 12, 0x0df2f2ff);
  canvas.composite(accent, 0, 0);

  const logoUrl = String(brand?.logoUrl ?? "https://torneomuskizbmplaya.es/logo_kolosaurios.png");
  const logo = await fetchImage(logoUrl, 140);
  let y = 40;
  if (logo) {
    const lx = Math.round((w - logo.width) / 2);
    canvas.composite(logo, lx, y);
    y += logo.height + 24;
  }

  const title = String(stitch?.title ?? payload.headline ?? "Torneo Muskiz");
  const subtitle = String(stitch?.subtitle ?? payload.subheadline ?? "");

  y += await drawText(canvas, font, 46, title.toUpperCase(), 48, y, 0x0df2f2ff);
  if (subtitle) {
    y += 8;
    y += await drawText(canvas, font, 32, subtitle, 48, y, 0xffffffff);
  }
  y += 28;

  const rows = stitch?.rows as { pos?: string; team?: string; pts?: string; line1?: string; line2?: string }[] | undefined;
  if (rows?.length) {
    for (const row of rows.slice(0, h > 1200 ? 10 : 7)) {
      let line: string;
      if (row.line2) {
        line = `${row.line1 ?? ""}`;
        y += await drawText(canvas, font, 26, line, 56, y, 0x94a3b8ff);
        line = String(row.line2);
        y += await drawText(canvas, font, 30, line, 56, y, 0xffffffff);
        y += 14;
      } else if (row.team) {
        line = `${row.pos ?? ""}. ${row.team} — ${row.pts ?? "0"} pts`;
        y += await drawText(canvas, font, 30, line, 56, y, 0xffffffff);
        y += 10;
      } else {
        line = String(row.line1 ?? "");
        y += await drawText(canvas, font, 28, line, 56, y, 0xffffffff);
        y += 12;
      }
      if (y > h - 120) break;
    }
  }

  const groupBlocks = payload.groupBlocks as { group: string; lines: string[] }[] | undefined;
  if (groupBlocks?.length && !rows?.length) {
    for (const block of groupBlocks.slice(0, 8)) {
      y += await drawText(canvas, font, 34, `GRUPO ${block.group}`, 48, y, 0x0df2f2ff);
      for (const ln of block.lines.slice(0, 4)) {
        y += await drawText(canvas, font, 28, ln, 56, y + 4, 0xffffffff);
        y += 8;
      }
      y += 16;
      if (y > h - 100) break;
    }
  }

  if (stitch?.teamA && stitch?.teamB) {
    y += await drawText(canvas, font, 36, String(stitch.teamA), 48, y, 0xffffffff);
    y += 16;
    y += await drawText(canvas, font, 56, String(stitch.score ?? ""), 48, y, 0x0df2f2ff);
    y += 16;
    y += await drawText(canvas, font, 36, String(stitch.teamB), 48, y, 0xffffffff);
    const meta = String(stitch.meta ?? "");
    if (meta) y += await drawText(canvas, font, 26, meta, 48, y + 12, 0x94a3b8ff);
  }

  const handle = String((brand as { instagramHandle?: string })?.instagramHandle ?? "@kolosaurios_muskiz");
  await drawText(canvas, font, 24, handle, 48, h - 72, 0x94a3b8ff);

  return await canvas.encodeJPEG(90);
}
