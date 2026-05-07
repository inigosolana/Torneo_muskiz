import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

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
