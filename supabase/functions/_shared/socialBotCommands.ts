/** Comandos del bot Telegram de revisión Instagram */

import {
  CODE_TO_DIVISION,
  DIVISIONS,
  type Division,
} from "./socialContentCore.ts";

export type SocialFormat = "story" | "feed";

export type SocialBotCommand =
  | { type: "help" }
  | { type: "lista" }
  | { type: "editar"; format: SocialFormat; hint: string }
  | { type: "grupos"; division: Division; format: SocialFormat }
  | { type: "clasificacion"; division: Division; group: string; format: SocialFormat }
  | { type: "equipo"; teamHint: string; format: SocialFormat }
  | { type: "historia"; teamHint: string }
  | { type: "resultados"; scheduleDay: string; format: SocialFormat }
  | { type: "partido"; teamHint: string; format: SocialFormat };

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractAfterKeyword(raw: string, keyword: string): string {
  const re = new RegExp(`^/?${keyword}\\s*`, "i");
  return raw.replace(re, "").trim();
}

export function resolveFormatFromText(text: string): { rest: string; format: SocialFormat } {
  const n = normalize(text);
  if (/\b(feed|post|cuadrado|11|1:1|1080x1080)\b/.test(n)) {
    return {
      rest: text.replace(/\b(feed|post|cuadrado|1:1|1080x1080)\b/gi, "").trim(),
      format: "feed",
    };
  }
  if (/\b(story|historia|vertical|916|9:16|1080x1920)\b/.test(n)) {
    return {
      rest: text.replace(/\b(story|historia|vertical|9:16|1080x1920)\b/gi, "").trim(),
      format: "story",
    };
  }
  return { rest: text, format: "story" };
}

export function resolveDivision(hint: string): Division | null {
  const n = normalize(hint);
  if (!n) return null;

  const rules: Array<{ div: Division; patterns: RegExp[] }> = [
    { div: "Senior Masculino", patterns: [/\bsm\b/, /senior\s*masc/, /senior\s*masculino/] },
    { div: "Senior Femenino", patterns: [/\bsf\b/, /senior\s*fem/, /senior\s*femenino/] },
    { div: "Juvenil Masculino", patterns: [/\bjm\b/, /juvenil\s*masc/] },
    { div: "Juvenil Femenino", patterns: [/\bjf\b/, /juvenil\s*fem/] },
    { div: "Cadete Masculino", patterns: [/\bcm\b/, /cadete\s*masc/] },
    { div: "Cadete Femenino", patterns: [/\bcf\b/, /cadete\s*fem/] },
    { div: "Infantil Masculino", patterns: [/\bim\b/, /infantil\s*masc/] },
    { div: "Infantil Femenino", patterns: [/\bif\b/, /infantil\s*fem/] },
  ];

  if (/\bsenior\b/.test(n) && !/\bfem|\bsf\b/.test(n) && /\bmasc|\bsm\b/.test(n) === false) {
    return "Senior Masculino";
  }
  if (/\bsenior\b/.test(n) && /\bfem|\bsf\b/.test(n)) return "Senior Femenino";
  if (/\bjuvenil\b/.test(n) && !/\bfem|\bjf\b/.test(n)) return "Juvenil Masculino";
  if (/\bjuvenil\b/.test(n) && /\bfem|\bjf\b/.test(n)) return "Juvenil Femenino";
  if (/\bcadete\b/.test(n) && !/\bfem|\bcf\b/.test(n)) return "Cadete Masculino";
  if (/\bcadete\b/.test(n) && /\bfem|\bcf\b/.test(n)) return "Cadete Femenino";
  if (/\binfantil\b/.test(n) && !/\bfem|\bif\b/.test(n)) return "Infantil Masculino";
  if (/\binfantil\b/.test(n) && /\bfem|\bif\b/.test(n)) return "Infantil Femenino";

  for (const { div, patterns } of rules) {
    if (patterns.some((p) => p.test(n))) return div;
  }
  for (const code of Object.keys(CODE_TO_DIVISION)) {
    if (new RegExp(`\\b${code.toLowerCase()}\\b`).test(n)) {
      return CODE_TO_DIVISION[code]!;
    }
  }
  return null;
}

function parseGroupLetter(hint: string): string | null {
  const m = /\bgrupo\s*([a-z0-9]+)\b/i.exec(hint) ?? /\b([a-z])\b$/i.exec(hint.trim());
  if (m?.[1]) return m[1].toUpperCase();
  return null;
}

function parseScheduleDay(hint: string): string {
  const n = normalize(hint);
  if (/\bviernes\b|\bvie\b/.test(n)) return "Viernes";
  if (/\bdomingo\b|\bdom\b/.test(n)) return "Domingo";
  return "Sábado";
}

export function parseSocialBotCommand(raw: string): SocialBotCommand | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const q = normalize(trimmed);

  if (q === "/start" || q === "/help" || q === "help" || q === "ayuda" || q.startsWith("/help")) {
    return { type: "help" };
  }
  if (q === "/lista" || q === "lista" || q === "comandos") {
    return { type: "lista" };
  }

  if (q.startsWith("/editar") || q.startsWith("editar ") || q === "/foto" || q.startsWith("/foto ")) {
    const kw = q.startsWith("/foto") ? "foto" : "editar";
    const { rest, format } = resolveFormatFromText(extractAfterKeyword(trimmed, kw.replace(/^\//, "")));
    return { type: "editar", format, hint: rest };
  }

  if (
    q.startsWith("/grupos") || q.startsWith("grupos ") ||
    q.startsWith("/fase") || q.startsWith("fase ") ||
    q.startsWith("fase_grupos") || q.startsWith("/fase_grupos")
  ) {
    const kw = q.startsWith("fase_grupos") ? "fase_grupos" : q.startsWith("/fase") ? "fase" : "grupos";
    const { rest, format } = resolveFormatFromText(extractAfterKeyword(trimmed, kw.replace(/^\//, "")));
    const div = resolveDivision(rest) ?? "Senior Masculino";
    return { type: "grupos", division: div, format };
  }

  if (q.startsWith("/clasificacion") || q.startsWith("clasificacion ")) {
    const { rest, format } = resolveFormatFromText(extractAfterKeyword(trimmed, "clasificacion"));
    const group = parseGroupLetter(rest) ?? "A";
    const divHint = rest.replace(/\bgrupo\s*[a-z0-9]+\b/gi, "").trim();
    const div = resolveDivision(divHint) ?? "Senior Masculino";
    return { type: "clasificacion", division: div, group, format };
  }

  if (q.startsWith("/historia") || q.startsWith("historia ")) {
    const hint = extractAfterKeyword(trimmed, "historia")
      .replace(/\b(story|historia|vertical)\b/gi, "")
      .trim();
    if (!hint) return null;
    return { type: "historia", teamHint: hint };
  }

  if (
    q.startsWith("/equipo") || q.startsWith("equipo ") ||
    q.startsWith("/viene") || q.startsWith("viene ") ||
    q.startsWith("/proximo") || q.startsWith("proximo ")
  ) {
    const kw = q.startsWith("viene") ? "viene" : q.startsWith("proximo") ? "proximo" : "equipo";
    let hint = extractAfterKeyword(trimmed, kw);
    hint = hint.replace(/^partido\s+/i, "").trim();
    const { rest, format } = resolveFormatFromText(hint);
    if (!rest) return null;
    return { type: "equipo", teamHint: rest, format };
  }

  if (q.startsWith("/resultados") || q.startsWith("resultados ")) {
    const { rest, format } = resolveFormatFromText(extractAfterKeyword(trimmed, "resultados"));
    return { type: "resultados", scheduleDay: parseScheduleDay(rest), format };
  }

  if (q.startsWith("/partido") || q.startsWith("partido ") || q.startsWith("/resultado")) {
    const kw = q.startsWith("/resultado") ? "resultado" : "partido";
    const { rest, format } = resolveFormatFromText(extractAfterKeyword(trimmed, kw));
    if (!rest) return null;
    return { type: "partido", teamHint: rest, format };
  }

  return null;
}

export function socialBotHelpText(chatId: string): string {
  return [
    "📸 Bot Instagram — Torneo Muskiz",
    "",
    "Pide publicaciones (te llegan con dimensiones correctas):",
    "",
    "🏐 Fase de grupos (story 9:16 por defecto):",
    "  /grupos senior",
    "  /grupos juvenil feed",
    "",
    "📊 Clasificación de un grupo:",
    "  /clasificacion senior grupo A",
    "  /clasificacion sf grupo B feed",
    "",
    "📅 Equipo que viene (próximo partido + plantilla + bases):",
    "  /equipo Kolosaurios",
    "  /viene Bitxipare story",
    "  /equipo Thunder feed  → post 1080×1080",
    "",
    "📱 Historia de equipo (siempre vertical 1080×1920):",
    "  /historia Kolosaurias JF",
    "",
    "📋 Resultados del día:",
    "  /resultados sabado",
    "  /resultados domingo feed",
    "",
    "⚽ Último partido del equipo:",
    "  /partido Kolosaurios",
    "",
    "📷 Editar foto del torneo (texto encima):",
    "  1) Envía la foto con pie de foto = tu texto",
    "  2) O envía foto y luego el texto en otro mensaje",
    "  /editar story — recordatorio formato vertical",
    "  Añade «feed» en el texto para post 1080×1080",
    "  (Vídeo: de momento solo fotos)",
    "",
    "Sufijos: story | feed | historia | post",
    "",
    `chat_id: ${chatId}`,
  ].join("\n");
}

export function socialBotListaText(): string {
  return [
    "Categorías:",
    ...DIVISIONS.map((d) => `• ${d}`),
    "",
    "Formatos:",
    "• story / historia → 1080×1920 (9:16)",
    "• feed / post → 1080×1080 (1:1)",
  ].join("\n");
}
