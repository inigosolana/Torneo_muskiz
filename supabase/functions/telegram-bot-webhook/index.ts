import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const encoder = new TextEncoder();

function parseChatIds(value?: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function internalFnHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SUPABASE_SERVICE_ROLE_KEY) {
    h.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    h.apikey = SUPABASE_SERVICE_ROLE_KEY;
  }
  return h;
}

async function sendOpsAlert(message: string, details: string, severity: "warning" | "error" = "error") {
  if (!SUPABASE_URL) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-ops-alert`, {
      method: "POST",
      headers: internalFnHeaders(),
      body: JSON.stringify({
        source: "backend.telegram-bot-webhook",
        severity,
        message,
        details: details.slice(0, 1500),
      }),
    });
  } catch {
    // no bloquear el webhook si el alert falla
  }
}

async function sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    await sendOpsAlert("Bot sin TELEGRAM_NOTIFICATIONS_BOT_TOKEN", "No se puede enviar respuesta al usuario.", "error");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    await sendOpsAlert(
      "Telegram API sendMessage falló",
      `chatId=${chatId} http=${res.status} body=${body.slice(0, 600)}`,
      "error",
    );
    return false;
  }
  return true;
}

async function answerCallbackQuery(callbackId: string, text: string, showAlert = false): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackId,
        text: text.slice(0, 200),
        show_alert: showAlert,
      }),
    });
  } catch {
    // ignore
  }
}

async function editMessageReplyMarkup(chatId: number, messageId: number): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch {
    // ignore
  }
}

async function appendMessageFooter(chatId: number, messageId: number, footer: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: footer,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_to_message_id: messageId,
        allow_sending_without_reply: true,
      }),
    });
  } catch {
    // ignore
  }
}

async function signActionPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(REVIEW_ACTION_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function callAdminReviewAction(params: {
  entity: "team" | "player-doc";
  id: string;
  action: "approve" | "reject";
  docType?: "dni" | "insurance";
  rejectionReason?: string;
}): Promise<{ ok: boolean; status: number; bodySnippet?: string }> {
  if (!SUPABASE_URL || !REVIEW_ACTION_SECRET) {
    return { ok: false, status: 0, bodySnippet: "Missing server configuration" };
  }
  const exp = String(Date.now() + 1000 * 60 * 60);
  const payload = [params.entity, params.id, params.action, params.docType ?? "", exp].join("|");
  const token = await signActionPayload(payload);
  const q = new URLSearchParams({
    entity: params.entity,
    id: params.id,
    action: params.action,
    exp,
    token,
  });
  if (params.docType) q.set("docType", params.docType);
  if (params.rejectionReason) q.set("rejectionReason", params.rejectionReason.slice(0, 1500));
  const url = `${SUPABASE_URL}/functions/v1/admin-review-action?${q.toString()}`;
  const res = await fetch(url);
  let bodySnippet: string | undefined;
  if (!res.ok) {
    try {
      bodySnippet = (await res.text()).slice(0, 400);
    } catch {
      // ignore
    }
  }
  return { ok: res.ok, status: res.status, bodySnippet };
}

type PendingRejectionRow = {
  chat_id: string;
  user_id: string;
  entity: "team" | "player-doc";
  entity_id: string;
  doc_type: "dni" | "insurance" | null;
  prompt_message_id: number | null;
  source_message_id: number | null;
  source_chat_id: number | null;
  expires_at: string;
};

async function setPendingRejection(row: {
  chat_id: string;
  user_id: string;
  entity: "team" | "player-doc";
  entity_id: string;
  doc_type: "dni" | "insurance" | null;
  prompt_message_id: number | null;
  source_message_id: number | null;
  source_chat_id: number | null;
}): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("telegram_pending_rejections")
    .upsert({ ...row, expires_at: expiresAt }, { onConflict: "chat_id,user_id" });
  if (error) {
    await sendOpsAlert("setPendingRejection falló", error.message, "error");
    return false;
  }
  return true;
}

async function getPendingRejection(chatId: string, userId: string): Promise<PendingRejectionRow | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("telegram_pending_rejections")
    .select("*")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await clearPendingRejection(chatId, userId);
    return null;
  }
  return data as PendingRejectionRow;
}

async function clearPendingRejection(chatId: string, userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("telegram_pending_rejections")
    .delete()
    .eq("chat_id", chatId)
    .eq("user_id", userId);
}

async function sendForceReplyPrompt(chatId: number, text: string): Promise<number | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Motivo del rechazo" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Number(data?.result?.message_id ?? 0) || null;
  } catch {
    return null;
  }
}

type CallbackParsed =
  | { kind: "team"; id: string; action: "approve" | "reject" }
  | { kind: "player-doc"; id: string; action: "approve" | "reject"; docType: "dni" | "insurance" }
  | null;

function parseCallbackData(raw: string): CallbackParsed {
  const parts = raw.split(":");
  if (parts.length === 3 && parts[0] === "t" && (parts[1] === "a" || parts[1] === "r") && parts[2]) {
    return {
      kind: "team",
      action: parts[1] === "a" ? "approve" : "reject",
      id: parts[2],
    };
  }
  if (
    parts.length === 4 &&
    parts[0] === "p" &&
    (parts[1] === "a" || parts[1] === "r") &&
    (parts[2] === "d" || parts[2] === "i") &&
    parts[3]
  ) {
    return {
      kind: "player-doc",
      action: parts[1] === "a" ? "approve" : "reject",
      docType: parts[2] === "d" ? "dni" : "insurance",
      id: parts[3],
    };
  }
  return null;
}

function describeAction(parsed: NonNullable<CallbackParsed>): { toast: string; footer: string } {
  if (parsed.kind === "team") {
    if (parsed.action === "approve") {
      return { toast: "✅ Equipo aprobado", footer: "✅ <b>EQUIPO APROBADO</b>" };
    }
    return { toast: "❌ Equipo denegado", footer: "❌ <b>EQUIPO DENEGADO</b>" };
  }
  const docName = parsed.docType === "dni" ? "DNI" : "Seguro";
  if (parsed.action === "approve") {
    return { toast: `✅ ${docName} aprobado`, footer: `✅ <b>${docName} APROBADO</b>` };
  }
  return { toast: `❌ ${docName} denegado`, footer: `❌ <b>${docName} DENEGADO</b>` };
}

async function handleCallbackQuery(callbackQuery: any): Promise<void> {
  const callbackId = String(callbackQuery?.id ?? "");
  const data = String(callbackQuery?.data ?? "");
  const fromUser = callbackQuery?.from;
  const fromId = fromUser?.id != null ? String(fromUser.id) : "";
  const message = callbackQuery?.message;
  const chatId = Number(message?.chat?.id);
  const messageId = Number(message?.message_id);

  if (!callbackId) return;

  const adminChatIds = parseChatIds(TELEGRAM_ADMIN_CHAT_IDS);
  const isAuthorized = adminChatIds.length === 0
    ? true // si no se han configurado chats admin, no bloqueamos (se pierde la protección)
    : adminChatIds.includes(String(chatId)) || adminChatIds.includes(fromId);
  if (!isAuthorized) {
    await answerCallbackQuery(callbackId, "❌ No autorizado.", true);
    return;
  }

  const parsed = parseCallbackData(data);
  if (!parsed) {
    await answerCallbackQuery(callbackId, "Acción desconocida.", true);
    return;
  }

  const userLabel = fromUser?.username
    ? `@${fromUser.username}`
    : (fromUser?.first_name ?? "admin");

  // DENEGAR: pedimos motivo en chat (flujo en dos pasos).
  if (parsed.action === "reject") {
    if (!supabaseAdmin) {
      await answerCallbackQuery(callbackId, "❌ Configuración incompleta.", true);
      return;
    }
    const targetLabel = parsed.kind === "team"
      ? "el equipo"
      : (parsed.docType === "dni" ? "el DNI" : "el seguro");
    const promptText = [
      `✏️ <b>Motivo del rechazo</b>`,
      ``,
      `Vas a denegar ${targetLabel}. Responde a este mensaje con el motivo`,
      `(por ejemplo: <i>"DNI ilegible, vuelve a subirlo"</i>).`,
      ``,
      `Para anular, escribe <code>/cancel</code>.`,
    ].join("\n");
    const promptMsgId = Number.isFinite(chatId)
      ? await sendForceReplyPrompt(chatId, promptText)
      : null;
    const stored = await setPendingRejection({
      chat_id: String(chatId),
      user_id: fromId,
      entity: parsed.kind,
      entity_id: parsed.id,
      doc_type: parsed.kind === "player-doc" ? parsed.docType : null,
      prompt_message_id: promptMsgId,
      source_message_id: Number.isFinite(messageId) ? messageId : null,
      source_chat_id: Number.isFinite(chatId) ? chatId : null,
    });
    if (!stored) {
      await answerCallbackQuery(callbackId, "❌ No pude registrar la denegación.", true);
      return;
    }
    if (Number.isFinite(chatId) && Number.isFinite(messageId)) {
      await editMessageReplyMarkup(chatId, messageId);
    }
    await answerCallbackQuery(callbackId, "✏️ Escribe el motivo en el chat.", false);
    return;
  }

  // APROBAR: ejecuta directamente.
  const params = parsed.kind === "team"
    ? { entity: "team" as const, id: parsed.id, action: parsed.action }
    : {
      entity: "player-doc" as const,
      id: parsed.id,
      action: parsed.action,
      docType: parsed.docType,
    };

  const result = await callAdminReviewAction(params);
  if (!result.ok) {
    await sendOpsAlert(
      "Callback Telegram: admin-review-action falló",
      `data=${data} status=${result.status} body=${result.bodySnippet ?? ""}`,
      "error",
    );
    await answerCallbackQuery(callbackId, "❌ Error al procesar la acción.", true);
    return;
  }

  const { toast, footer } = describeAction(parsed);
  await answerCallbackQuery(callbackId, toast, false);

  if (Number.isFinite(chatId) && Number.isFinite(messageId)) {
    await editMessageReplyMarkup(chatId, messageId);
    await appendMessageFooter(chatId, messageId, `${footer} · Por ${userLabel}`);
  }
}

async function processPendingRejection(
  pending: PendingRejectionRow,
  motivo: string,
  fromUser: { username?: string; first_name?: string } | null,
): Promise<{ ok: boolean; toast: string; footer: string; chatId: number; sourceMessageId: number | null }> {
  const params = pending.entity === "team"
    ? {
      entity: "team" as const,
      id: pending.entity_id,
      action: "reject" as const,
      rejectionReason: motivo,
    }
    : {
      entity: "player-doc" as const,
      id: pending.entity_id,
      action: "reject" as const,
      docType: (pending.doc_type === "insurance" ? "insurance" : "dni") as "dni" | "insurance",
      rejectionReason: motivo,
    };
  const result = await callAdminReviewAction(params);
  const parsed = pending.entity === "team"
    ? { kind: "team" as const, id: pending.entity_id, action: "reject" as const }
    : {
      kind: "player-doc" as const,
      id: pending.entity_id,
      action: "reject" as const,
      docType: (pending.doc_type === "insurance" ? "insurance" : "dni") as "dni" | "insurance",
    };
  const { toast, footer } = describeAction(parsed);
  return {
    ok: result.ok,
    toast,
    footer,
    chatId: Number(pending.source_chat_id ?? pending.chat_id),
    sourceMessageId: pending.source_message_id,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !BOT_TOKEN) {
      if (SUPABASE_URL && !BOT_TOKEN) {
        void sendOpsAlert(
          "Falta TELEGRAM_NOTIFICATIONS_BOT_TOKEN",
          "telegram-bot-webhook no puede responder en Telegram.",
          "critical",
        );
      }
      return new Response(JSON.stringify({ error: "Missing server configuration." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update = await req.json();

    // Botones inline (aprobar/denegar equipo o documento) -> ejecutar dentro de Telegram.
    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return new Response(JSON.stringify({ ok: true, type: "callback_query" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = update?.message ?? update?.edited_message;
    const chatId = Number(message?.chat?.id);
    const userId = Number(message?.from?.id);
    const text = String(message?.text ?? "").trim();
    if (!Number.isFinite(chatId) || !text) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // /cancel: si hay denegación pendiente, la cancela.
    if (text.toLowerCase().startsWith("/cancel")) {
      const pending = await getPendingRejection(String(chatId), String(userId));
      if (pending) {
        await clearPendingRejection(String(chatId), String(userId));
        await sendTelegramMessage(chatId, "🚫 Denegación cancelada. Si quieres, vuelve a pulsar Denegar.");
        return new Response(JSON.stringify({ ok: true, cancelled: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Si hay denegación pendiente para este (chat, user), usamos el texto como motivo.
    const pending = await getPendingRejection(String(chatId), String(userId));
    if (pending) {
      const motivo = text.slice(0, 1500).trim();
      if (motivo.length < 5) {
        await sendTelegramMessage(
          chatId,
          "✏️ El motivo es demasiado corto. Escribe al menos una frase explicando el problema, o /cancel para anular.",
        );
        return new Response(JSON.stringify({ ok: true, awaiting: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fromUser = message?.from ?? null;
      const result = await processPendingRejection(pending, motivo, fromUser);
      await clearPendingRejection(String(chatId), String(userId));
      if (!result.ok) {
        await sendTelegramMessage(chatId, "❌ No pude completar la denegación. Vuelve a intentarlo.");
        return new Response(JSON.stringify({ ok: false }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userLabel = fromUser?.username ? `@${fromUser.username}` : (fromUser?.first_name ?? "admin");
      const ackChatId = Number.isFinite(result.chatId) ? result.chatId : chatId;
      if (result.sourceMessageId && Number.isFinite(ackChatId)) {
        await appendMessageFooter(
          ackChatId,
          result.sourceMessageId,
          `${result.footer} · Por ${userLabel}\n<i>Motivo:</i> ${motivo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`,
        );
      } else {
        await sendTelegramMessage(chatId, `${result.footer} · Por ${userLabel}\nMotivo: ${motivo}`);
      }
      return new Response(JSON.stringify({ ok: true, rejected: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queryRes = await fetch(`${SUPABASE_URL}/functions/v1/telegram-admin-query`, {
      method: "POST",
      headers: internalFnHeaders(),
      body: JSON.stringify({ chatId, userId, text }),
    });
    const queryJson: Record<string, unknown> = await queryRes.json().catch(() => ({}));

    if (!queryRes.ok) {
      const errText = typeof queryJson.error === "string"
        ? queryJson.error
        : JSON.stringify(queryJson).slice(0, 400);
      // No alertar 403: consultas no autorizadas son habituales
      if (queryRes.status === 401 || queryRes.status >= 500) {
        await sendOpsAlert(
          "telegram-admin-query respondió error",
          `http=${queryRes.status} chatId=${chatId} userId=${userId} text=${text.slice(0, 120)} detail=${errText}`,
          "error",
        );
      }
    }

    const reply = queryRes.ok
      ? String(queryJson?.message ?? queryJson?.error ?? "No pude procesar la consulta.")
      : queryRes.status === 403
      ? String(queryJson?.message ?? "No autorizado para consultas.")
      : queryRes.status === 401
      ? "Error de autenticación con el servidor. El equipo ha sido notificado."
      : `Error interno (${queryRes.status}). Si persiste, el equipo ya ha recibido alerta.`;

    const sent = await sendTelegramMessage(chatId, reply);
    if (!sent && queryRes.ok) {
      await sendOpsAlert(
        "No se pudo entregar la respuesta al usuario en Telegram",
        `chatId=${chatId} (sendMessage falló; la consulta sí respondió ok)`,
        "warning",
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await sendOpsAlert("Excepción en telegram-bot-webhook", msg, "error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
