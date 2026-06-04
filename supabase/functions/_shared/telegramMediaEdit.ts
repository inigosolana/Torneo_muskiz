/**
 * Descarga fotos de Telegram y las prepara para Instagram (texto superpuesto).
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const BOT_TOKEN = () => Deno.env.get("TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN")?.trim() ?? "";

import { loadPreviewFont } from "./loadPreviewFont.ts";

export type MediaFormat = "story" | "feed";

export function parseMediaFormat(text: string): MediaFormat {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(feed|post|cuadrado|1:1|1080x1080)\b/.test(n)) return "feed";
  return "story";
}

/** Extrae instrucciones de texto (caption o mensaje aparte). */
export function parseOverlayText(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^\/editar\s*/i, "").trim();
  t = t.replace(/^texto\s*:\s*/i, "").trim();
  t = t.replace(/\b(story|feed|post|historia|1080x1080|1080x1920|9:16|1:1)\b/gi, "").trim();
  return t;
}

export async function downloadTelegramFile(fileId: string): Promise<Uint8Array> {
  const token = BOT_TOKEN();
  if (!token) throw new Error("TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN no configurado");

  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json() as { ok?: boolean; result?: { file_path?: string } };
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error("No se pudo obtener el archivo de Telegram");
  }

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`,
  );
  if (!fileRes.ok) throw new Error("Error al descargar la imagen");
  return new Uint8Array(await fileRes.arrayBuffer());
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [text.slice(0, maxChars)];
}

function pickLargestPhoto(
  photos: { file_id: string; width?: number; height?: number }[],
): string {
  const sorted = [...photos].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return sorted[0]!.file_id;
}

export function extractPhotoFileId(message: Record<string, unknown>): string | null {
  const photos = message.photo as { file_id: string; width?: number; height?: number }[] | undefined;
  if (photos?.length) return pickLargestPhoto(photos);

  const doc = message.document as { file_id?: string; mime_type?: string } | undefined;
  if (doc?.file_id && (doc.mime_type ?? "").startsWith("image/")) return doc.file_id;

  return null;
}

export async function compositeImageWithText(
  imageBytes: Uint8Array,
  overlayText: string,
  format: MediaFormat,
): Promise<Uint8Array> {
  const text = overlayText.trim();
  if (!text) throw new Error("Falta el texto para la imagen");

  const targetW = format === "story" ? 1080 : 1080;
  const targetH = format === "story" ? 1920 : 1080;

  let img = await Image.decode(imageBytes);
  img = img.cover(targetW, targetH);

  const font = await loadPreviewFont();
  const lines = wrapLines(text, format === "story" ? 28 : 32, format === "story" ? 5 : 4);
  const fontSize = format === "story" ? (lines.length > 3 ? 42 : 48) : (lines.length > 3 ? 38 : 44);
  const lineHeight = Math.round(fontSize * 1.35);

  const barHeight = Math.min(
    Math.round(targetH * 0.32),
    lines.length * lineHeight + 56,
  );
  const barY = targetH - barHeight;

  const bar = new Image(targetW, barHeight, 0x000000b8);
  img.composite(bar, 0, barY);

  const accent = 0x0df2f2ff;
  const white = 0xffffffff;
  const totalTextH = lines.length * lineHeight;
  let y = barY + Math.round((barHeight - totalTextH) / 2);

  for (const line of lines) {
    const textImg = await Image.renderText(font, fontSize, line, white);
    const x = Math.max(8, Math.round((targetW - textImg.width) / 2));
    img.composite(textImg, x, y);
    const underline = new Image(Math.min(textImg.width + 8, targetW - x), 4, accent);
    img.composite(underline, x, y + textImg.height + 2);
    y += lineHeight;
  }

  return await img.encodeJPEG(88);
}

export async function sendTelegramPhoto(
  chatId: string,
  imageBytes: Uint8Array,
  caption?: string,
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] },
): Promise<boolean> {
  const token = BOT_TOKEN();
  if (!token) return false;

  const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
  const mime = isPng ? "image/png" : "image/jpeg";
  const name = isPng ? "torneo-preview.png" : "torneo-preview.jpg";

  const form = new FormData();
  form.append("chat_id", chatId);
  const blob = new Blob([imageBytes], { type: mime });
  form.append("photo", blob, name);
  if (caption?.trim()) form.append("caption", caption.slice(0, 900));
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));

  let res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  let data = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };
  if (data.ok) return true;

  console.error("sendPhoto failed:", data.description ?? res.status);

  const form2 = new FormData();
  form2.append("chat_id", chatId);
  form2.append("document", blob, name);
  if (caption?.trim()) form2.append("caption", caption.slice(0, 900));
  res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form2,
  });
  data = await res.json().catch(() => ({})) as { ok?: boolean };
  return !!data.ok;
}
