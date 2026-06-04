/**
 * Vista previa JPEG para Instagram (Telegram). Diseño simple y robusto en Edge.
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/ttf/DejaVuSans-Bold.ttf",
  "https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/version_2_37/ttf/DejaVuSans-Bold.ttf",
];

let cachedFont: Uint8Array | null = null;

async function loadFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  let lastErr = "Font load failed";
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      cachedFont = new Uint8Array(await res.arrayBuffer());
      if (cachedFont.length > 1000) return cachedFont;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

function targetSize(payload: Record<string, unknown>): { w: number; h: number } {
  const fmt = payload.format as { width?: number; height?: number } | undefined;
  return { w: fmt?.width ?? 1080, h: fmt?.height ?? 1920 };
}

function buildBodyText(payload: Record<string, unknown>): string {
  const stitch = payload.stitch as Record<string, unknown> | undefined;
  const lines: string[] = [];

  const rows = stitch?.rows as { pos?: string; team?: string; pts?: string; line1?: string; line2?: string }[] | undefined;
  if (rows?.length) {
    for (const row of rows) {
      if (row.line2) {
        lines.push(String(row.line1 ?? ""));
        lines.push(String(row.line2 ?? ""));
      } else if (row.team) {
        lines.push(`${row.pos ?? ""}. ${row.team} (${row.pts ?? "0"} pts)`);
      } else if (row.line1) {
        lines.push(String(row.line1));
      }
    }
  }

  const groupBlocks = payload.groupBlocks as { group: string; lines: string[] }[] | undefined;
  if (groupBlocks?.length) {
    for (const b of groupBlocks) {
      lines.push(`GRUPO ${b.group}`);
      for (const ln of b.lines) lines.push(ln);
      lines.push("");
    }
  }

  if (stitch?.teamA && stitch?.teamB) {
    lines.push(String(stitch.teamA));
    lines.push(String(stitch.score ?? ""));
    lines.push(String(stitch.teamB));
    if (stitch.meta) lines.push(String(stitch.meta));
  }

  return lines.join("\n").slice(0, 1200);
}

async function encodeJpeg(img: Image): Promise<Uint8Array> {
  try {
    return await img.encodeJPEG(82);
  } catch {
    return await img.encode(1);
  }
}

/** Imagen mínima sin fuente (si falla renderText). */
async function renderMinimal(payload: Record<string, unknown>): Promise<Uint8Array> {
  const { w, h } = targetSize(payload);
  const canvas = new Image(w, h, 0x0b0f14ff);
  const bar = new Image(w, 100, 0x0df2f2ff);
  canvas.composite(bar, 0, h - 100);
  return await encodeJpeg(canvas);
}

export async function renderPayloadPreviewImage(
  payload: Record<string, unknown>,
): Promise<Uint8Array> {
  const { w, h } = targetSize(payload);
  const brand = payload.brand as { logoUrl?: string; instagramHandle?: string } | undefined;
  const stitch = payload.stitch as Record<string, unknown> | undefined;

  let canvas = new Image(w, h, 0x0b0f14ff);
  canvas.composite(new Image(w, 14, 0x0df2f2ff), 0, 0);

  let y = 36;

  try {
    const logoUrl = String(brand?.logoUrl ?? "https://torneomuskizbmplaya.es/logo_kolosaurios.png");
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      let logo = await Image.decode(bytes);
      const max = 120;
      if (logo.width > max || logo.height > max) {
        const s = max / Math.max(logo.width, logo.height);
        logo = logo.resize(Math.round(logo.width * s), Math.round(logo.height * s));
      }
      canvas.composite(logo, Math.round((w - logo.width) / 2), y);
      y += logo.height + 20;
    }
  } catch {
    /* sin logo */
  }

  const font = await loadFont();
  const title = String(stitch?.title ?? payload.headline ?? "TORNEO MUSKIZ").toUpperCase();
  const subtitle = String(stitch?.subtitle ?? payload.subheadline ?? "");

  const titleImg = await Image.renderText(font, 42, title.slice(0, 40), 0x0df2f2ff);
  canvas.composite(titleImg, 48, y);
  y += titleImg.height + 12;

  if (subtitle) {
    const subImg = await Image.renderText(font, 28, subtitle.slice(0, 50), 0xffffffff);
    canvas.composite(subImg, 48, y);
    y += subImg.height + 20;
  }

  const body = buildBodyText(payload);
  if (body) {
    const chunks = body.split("\n");
    const fontSize = h > 1200 ? 26 : 24;
    for (const chunk of chunks.slice(0, 14)) {
      if (y > h - 100) break;
      const line = chunk.slice(0, 52);
      if (!line.trim()) {
        y += 10;
        continue;
      }
      const t = await Image.renderText(font, fontSize, line, 0xffffffff);
      canvas.composite(t, 52, y);
      y += t.height + 6;
    }
  }

  const handle = String(brand?.instagramHandle ?? "@kolosaurios_muskiz");
  const foot = await Image.renderText(font, 22, handle, 0x94a3b8ff);
  canvas.composite(foot, 48, h - foot.height - 40);

  return await encodeJpeg(canvas);
}

export async function renderPayloadPreviewSafe(
  payload: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; mode: "full" | "minimal" }> {
  try {
    return { bytes: await renderPayloadPreviewImage(payload), mode: "full" };
  } catch (e) {
    console.error("renderPayloadPreviewImage failed:", e);
    return { bytes: await renderMinimal(payload), mode: "minimal" };
  }
}
