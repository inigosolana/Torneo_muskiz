import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");

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
    const userLabel = fromUser?.username
      ? `@${fromUser.username}`
      : (fromUser?.first_name ?? "admin");
    // Pequeño reply con "quién" lo hizo. La tarjeta-resumen completa la envía admin-review-action.
    await appendMessageFooter(chatId, messageId, `${footer} · Por ${userLabel}`);
  }
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
