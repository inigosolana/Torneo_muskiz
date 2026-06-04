/**
 * Vista previa PNG para Instagram (Telegram). Fuente embebida (sin CDN).
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { loadPreviewFont } from "./loadPreviewFont.ts";

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

async function encodePng(img: Image): Promise<Uint8Array> {
  return await img.encode();
}

async function drawLine(
  canvas: Image,
  font: Uint8Array,
  size: number,
  text: string,
  x: number,
  y: number,
  color: number,
): Promise<number> {
  const line = text.slice(0, 56);
  const t = await Image.renderText(font, size, line, color);
  canvas.composite(t, x, y);
  return t.height;
}

export async function renderPayloadPreviewImage(
  payload: Record<string, unknown>,
): Promise<Uint8Array> {
  const { w, h } = targetSize(payload);
  const brand = payload.brand as { logoUrl?: string; instagramHandle?: string } | undefined;
  const stitch = payload.stitch as Record<string, unknown> | undefined;
  const font = await loadPreviewFont();

  const canvas = new Image(w, h, 0x0b0f14ff);
  canvas.composite(new Image(w, 16, 0x0df2f2ff), 0, 0);
  canvas.composite(new Image(w, 120, 0x0a3d3dff), 0, h - 120);

  let y = 40;

  try {
    const logoUrl = String(brand?.logoUrl ?? "https://torneomuskizbmplaya.es/logo_kolosaurios.png");
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      let logo = await Image.decode(bytes);
      const max = 130;
      if (logo.width > max || logo.height > max) {
        const s = max / Math.max(logo.width, logo.height);
        logo = logo.resize(Math.round(logo.width * s), Math.round(logo.height * s));
      }
      canvas.composite(logo, Math.round((w - logo.width) / 2), y);
      y += logo.height + 24;
    }
  } catch (e) {
    console.warn("logo skip", e);
  }

  const title = String(stitch?.title ?? payload.headline ?? "TORNEO MUSKIZ").toUpperCase();
  const subtitle = String(stitch?.subtitle ?? payload.subheadline ?? "");

  y += await drawLine(canvas, font, 44, title, 48, y, 0x0df2f2ff);
  y += 14;

  if (subtitle) {
    y += await drawLine(canvas, font, 30, subtitle, 48, y, 0xffffffff);
    y += 24;
  }

  const body = buildBodyText(payload);
  if (body) {
    const fontSize = h > 1200 ? 28 : 26;
    for (const chunk of body.split("\n").slice(0, 22)) {
      if (y > h - 140) break;
      const line = chunk.trimEnd();
      if (!line) {
        y += 12;
        continue;
      }
      const color = line.startsWith("GRUPO") ? 0x0df2f2ff : 0xffffffff;
      y += await drawLine(canvas, font, fontSize, line, 52, y, color) + 8;
    }
  }

  const handle = String(brand?.instagramHandle ?? "@kolosaurios_muskiz");
  await drawLine(canvas, font, 24, handle, 48, h - 72, 0x94a3b8ff);

  return await encodePng(canvas);
}

export async function renderPayloadPreviewSafe(
  payload: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; mode: "full" | "error" }> {
  try {
    return { bytes: await renderPayloadPreviewImage(payload), mode: "full" };
  } catch (e) {
    console.error("renderPayloadPreviewImage failed:", e);
    throw e;
  }
}
