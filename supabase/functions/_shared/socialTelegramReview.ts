/** Envío de borradores Instagram al bot de revisión Telegram */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { renderPayloadPreviewSafe } from "./renderSocialPreview.ts";
import { sendTelegramPhoto } from "./telegramMediaEdit.ts";

export const SOCIAL_REVIEW_STATE_KEY = "social_review_state";

const BOT_TOKEN = () => Deno.env.get("TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN")?.trim() ?? "";

export function parseChatIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function resolveReviewChatIds(envIds: string | undefined, stored: string[] | undefined): string[] {
  const fromEnv = parseChatIds(envIds);
  if (fromEnv.length) return fromEnv;
  const admin = parseChatIds(Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS"));
  if (admin.length) return admin;
  return stored ?? [];
}

export type SocialReviewDraft = {
  id: string;
  payload: Record<string, unknown>;
  caption: string;
  status: "pending" | "approved" | "revising";
  createdAt: string;
  updatedAt: string;
};

export type PendingMediaEdit = {
  fileId: string;
  format: "story" | "feed";
  receivedAt: string;
};

export type SocialReviewState = {
  chatIds: string[];
  drafts: Record<string, SocialReviewDraft>;
  pendingRevision: Record<string, string>;
  pendingMediaEdit?: Record<string, PendingMediaEdit>;
};

export function newDraftId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function loadReviewState(supabase: SupabaseClient): Promise<SocialReviewState> {
  const { data } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", SOCIAL_REVIEW_STATE_KEY)
    .maybeSingle();
  const v = data?.value as SocialReviewState | undefined;
  return {
    chatIds: v?.chatIds ?? [],
    drafts: v?.drafts ?? {},
    pendingRevision: v?.pendingRevision ?? {},
    pendingMediaEdit: v?.pendingMediaEdit ?? {},
  };
}

export async function setPendingMediaEdit(
  supabase: SupabaseClient,
  chatId: string,
  edit: PendingMediaEdit | null,
): Promise<void> {
  const state = await loadReviewState(supabase);
  if (!state.pendingMediaEdit) state.pendingMediaEdit = {};
  if (edit) state.pendingMediaEdit[chatId] = edit;
  else delete state.pendingMediaEdit[chatId];
  await saveReviewState(supabase, state);
}

export async function getPendingMediaEdit(
  supabase: SupabaseClient,
  chatId: string,
): Promise<PendingMediaEdit | null> {
  const state = await loadReviewState(supabase);
  return state.pendingMediaEdit?.[chatId] ?? null;
}

export async function saveReviewState(supabase: SupabaseClient, state: SocialReviewState): Promise<void> {
  const { data: existing } = await supabase
    .from("site_content")
    .select("key")
    .eq("key", SOCIAL_REVIEW_STATE_KEY)
    .maybeSingle();
  if (existing) {
    await supabase.from("site_content").update({ value: state }).eq("key", SOCIAL_REVIEW_STATE_KEY);
  } else {
    await supabase.from("site_content").insert({ key: SOCIAL_REVIEW_STATE_KEY, value: state });
  }
}

export async function registerReviewChatId(supabase: SupabaseClient, chatId: string): Promise<void> {
  const state = await loadReviewState(supabase);
  if (!state.chatIds.includes(chatId)) {
    state.chatIds.push(chatId);
    await saveReviewState(supabase, state);
  }
}

function formatStitchPreview(payload: Record<string, unknown>): string {
  const stitch = payload.stitch as Record<string, unknown> | undefined;
  if (!stitch) return "";
  const rows = stitch.rows as { pos?: string; team?: string; pts?: string; line1?: string; line2?: string }[] | undefined;
  if (rows?.length) {
    return rows.slice(0, 6).map((r) => {
      if (r.line2) return `• ${r.line1}\n  ${r.line2}`;
      return `• ${r.pos ?? ""} ${r.team ?? ""} ${r.pts ?? ""} pts`.trim();
    }).join("\n");
  }
  if (stitch.teamA && stitch.teamB) {
    return `${stitch.teamA} ${stitch.score ?? ""} ${stitch.teamB}\n${stitch.meta ?? ""}`;
  }
  return "";
}

export function formatReviewTelegramText(draft: SocialReviewDraft): string {
  const p = draft.payload;
  const template = String(p.template ?? "post");
  const format = p.format as { label?: string; width?: number; height?: number } | undefined;
  const dim = format?.label ?? (format?.width ? `${format.width}×${format.height}` : "");
  const headline = String(p.headline ?? p.subheadline ?? template);
  const stitch = formatStitchPreview(p);
  const parts = [
    "📸 BORRADOR INSTAGRAM",
    `Plantilla: ${template}`,
    dim ? `📐 ${dim}` : "",
    headline ? `Título: ${headline}` : "",
    stitch ? `\nDatos gráficos:\n${stitch}` : "",
    "\n——— TEXTO PROPUESTO ———",
    draft.caption.slice(0, 2800),
    `\nID: ${draft.id}`,
    "Usa los botones o responde con cambios tras «Pedir cambios».",
  ];
  return parts.filter(Boolean).join("\n");
}

export async function saveDraft(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  caption?: string,
): Promise<SocialReviewDraft> {
  const state = await loadReviewState(supabase);
  const id = newDraftId();
  const cap = caption ?? String(payload.captionDraft ?? "");
  const draft: SocialReviewDraft = {
    id,
    payload,
    caption: cap,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.drafts[id] = draft;
  const keys = Object.keys(state.drafts);
  if (keys.length > 80) {
    keys.sort((a, b) =>
      (state.drafts[a]?.createdAt ?? "").localeCompare(state.drafts[b]?.createdAt ?? "")
    );
    for (let i = 0; i < keys.length - 60; i++) delete state.drafts[keys[i]!];
  }
  await saveReviewState(supabase, state);
  return draft;
}

export async function getDraft(supabase: SupabaseClient, id: string): Promise<SocialReviewDraft | null> {
  const state = await loadReviewState(supabase);
  return state.drafts[id] ?? null;
}

export async function updateDraftCaption(
  supabase: SupabaseClient,
  id: string,
  caption: string,
  status: SocialReviewDraft["status"] = "pending",
): Promise<SocialReviewDraft | null> {
  const state = await loadReviewState(supabase);
  const d = state.drafts[id];
  if (!d) return null;
  d.caption = caption;
  d.status = status;
  d.updatedAt = new Date().toISOString();
  await saveReviewState(supabase, state);
  return d;
}

export async function setPendingRevision(
  supabase: SupabaseClient,
  chatId: string,
  draftId: string | null,
): Promise<void> {
  const state = await loadReviewState(supabase);
  if (draftId) state.pendingRevision[chatId] = draftId;
  else delete state.pendingRevision[chatId];
  await saveReviewState(supabase, state);
}

export async function getPendingRevisionDraftId(
  supabase: SupabaseClient,
  chatId: string,
): Promise<string | null> {
  const state = await loadReviewState(supabase);
  return state.pendingRevision[chatId] ?? null;
}

async function tgApi(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown }> {
  const token = BOT_TOKEN();
  if (!token) return { ok: false };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: unknown };
  return { ok: !!data.ok, result: data.result };
}

function draftKeyboard(draftId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Aprobar", callback_data: `sr:ok:${draftId}` },
        { text: "✏️ Pedir cambios", callback_data: `sr:rev:${draftId}` },
      ],
      [{ text: "🔄 Regenerar texto", callback_data: `sr:gen:${draftId}` }],
    ],
  };
}

export async function notifyDraftUpdated(
  chatIds: string[],
  draft: SocialReviewDraft,
): Promise<boolean> {
  const keyboard = draftKeyboard(draft.id);
  const fmt = draft.payload.format as { label?: string } | undefined;
  const shortCaption = `📸 Listo para publicar · ${fmt?.label ?? "Instagram"} · ID ${draft.id}`;

  let anyOk = false;
  for (const chatId of chatIds) {
    let photoSent = false;
    try {
      const { bytes, mode } = await renderPayloadPreviewSafe(draft.payload);
      const cap = mode === "minimal"
        ? `${shortCaption}\n(vista previa simplificada)`
        : shortCaption;
      photoSent = await sendTelegramPhoto(chatId, bytes, cap);
      if (!photoSent) {
        photoSent = await sendTelegramPhoto(chatId, bytes, undefined);
      }
    } catch (e) {
      console.error("notifyDraftUpdated photo", e);
    }

    const text = formatReviewTelegramText(draft) +
      (photoSent ? "\n\n👆 Imagen lista para guardar y subir a Instagram." : "\n\n⚠️ No se pudo enviar la imagen; solo texto.");
    const r = await tgApi("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
    if (r.ok || photoSent) anyOk = true;
  }
  return anyOk;
}

export async function sendDraftToReviewTelegram(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  caption?: string,
): Promise<{ sent: boolean; draftId?: string; error?: string }> {
  const token = BOT_TOKEN();
  if (!token) {
    return { sent: false, error: "TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN no configurado" };
  }

  const state = await loadReviewState(supabase);
  const chatIds = resolveReviewChatIds(
    Deno.env.get("TELEGRAM_SOCIAL_REVIEW_CHAT_IDS"),
    state.chatIds,
  );
  if (!chatIds.length) {
    return {
      sent: false,
      error: "Sin chat de revisión: escribe /start al bot de Instagram o configura TELEGRAM_SOCIAL_REVIEW_CHAT_IDS",
    };
  }

  const draft = await saveDraft(supabase, payload, caption);
  const anyOk = await notifyDraftUpdated(chatIds, draft);
  return { sent: anyOk, draftId: draft.id, error: anyOk ? undefined : "Telegram sendMessage falló" };
}

export async function sendPlainReviewMessage(chatId: string, text: string): Promise<boolean> {
  const r = await tgApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  return r.ok;
}

export async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  await tgApi("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}
