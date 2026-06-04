/** Fuente embebida en el bundle (Edge no incluye .ttf sueltos en deploy). */

import { decodePreviewFont } from "./previewFontData.ts";

let cachedFont: Uint8Array | null = null;

const FONT_URLS = [
  "https://torneomuskizbmplaya.es/fonts/DejaVuSans-Bold.ttf",
  "https://www.torneomuskizbmplaya.es/fonts/DejaVuSans-Bold.ttf",
];

export async function loadPreviewFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;

  try {
    const embedded = decodePreviewFont();
    if (embedded.length > 1000) {
      cachedFont = embedded;
      return cachedFont;
    }
  } catch (e) {
    console.warn("embedded font decode", e);
  }

  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 1000) {
        cachedFont = bytes;
        return cachedFont;
      }
    } catch (e) {
      console.warn("font fetch", url, e);
    }
  }

  throw new Error("Fuente no disponible");
}
