import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Registra setWebhook en Telegram para los dos bots (equipos / documentación jugadores).
 * Autorización: header `x-configure-tg-secret` = secret `CONFIGURE_TG_WEBHOOK_SECRET`,
 * o `Authorization: Bearer` = `SUPABASE_SERVICE_ROLE_KEY` (trim en ambos).
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const CONFIGURE_SECRET = Deno.env.get("CONFIGURE_TG_WEBHOOK_SECRET")?.trim() ?? "";
const PLAYER_DOCS_TOKEN = Deno.env.get("PLAYER_DOCS_TELEGRAM_BOT_TOKEN")?.trim() ?? "";
const TEAMS_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN")?.trim() ?? "";
const SOCIAL_REVIEW_TOKEN = Deno.env.get("TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN")?.trim() ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-configure-tg-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function tgSetWebhook(botToken: string, url: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      allowed_updates: ["message", "edited_message", "callback_query"],
      drop_pending_updates: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, telegram: data };
}

async function tgGetWebhookInfo(botToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, telegram: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization")?.trim();
  const jwt = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = req.headers.get("x-configure-tg-secret")?.trim() ?? "";
  const authorized = (SERVICE_ROLE && jwt === SERVICE_ROLE) ||
    (CONFIGURE_SECRET && headerSecret === CONFIGURE_SECRET);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE_URL" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const playerWebhookUrl = `${SUPABASE_URL}/functions/v1/telegram-player-docs-bot-webhook`;
  const teamsWebhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot-webhook`;
  const socialReviewWebhookUrl = `${SUPABASE_URL}/functions/v1/telegram-social-review-webhook`;

  const out: Record<string, unknown> = {
    playerWebhookUrl,
    teamsWebhookUrl,
    socialReviewWebhookUrl,
  };

  if (PLAYER_DOCS_TOKEN) {
    out.player_docs_setWebhook = await tgSetWebhook(PLAYER_DOCS_TOKEN, playerWebhookUrl);
    out.player_docs_getWebhookInfo = await tgGetWebhookInfo(PLAYER_DOCS_TOKEN);
  } else {
    out.player_docs_setWebhook = { skipped: true, reason: "PLAYER_DOCS_TELEGRAM_BOT_TOKEN missing" };
  }

  if (TEAMS_TOKEN) {
    out.teams_setWebhook = await tgSetWebhook(TEAMS_TOKEN, teamsWebhookUrl);
    out.teams_getWebhookInfo = await tgGetWebhookInfo(TEAMS_TOKEN);
  } else {
    out.teams_setWebhook = { skipped: true, reason: "TELEGRAM_NOTIFICATIONS_BOT_TOKEN missing" };
  }

  if (SOCIAL_REVIEW_TOKEN) {
    out.social_review_setWebhook = await tgSetWebhook(SOCIAL_REVIEW_TOKEN, socialReviewWebhookUrl);
    out.social_review_getWebhookInfo = await tgGetWebhookInfo(SOCIAL_REVIEW_TOKEN);
  } else {
    out.social_review_setWebhook = { skipped: true, reason: "TELEGRAM_SOCIAL_REVIEW_BOT_TOKEN missing" };
  }

  return new Response(JSON.stringify({ ok: true, ...out }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
