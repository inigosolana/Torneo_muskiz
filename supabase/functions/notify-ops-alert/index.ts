import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BOT_TOKEN = Deno.env.get("ALERTS_TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("ALERTS_TELEGRAM_CHAT_ID");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

type AlertPayload = {
  source?: string;
  severity?: "info" | "warning" | "error" | "critical";
  message?: string;
  details?: string;
};

function formatAlert(payload: AlertPayload) {
  const source = payload.source ?? "unknown";
  const severity = (payload.severity ?? "error").toUpperCase();
  const message = payload.message ?? "Unknown alert";
  const details = payload.details ?? "";
  return [
    `ALERTA ${severity}`,
    `Origen: ${source}`,
    `Mensaje: ${message}`,
    details ? `Detalle: ${details.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!BOT_TOKEN || !CHAT_ID) {
      return new Response(JSON.stringify({ error: "Missing alert secrets." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json() as AlertPayload;
    const text = formatAlert(payload);

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(CHAT_ID),
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const body = await tgRes.text();
      return new Response(JSON.stringify({ error: `Telegram failed: ${body}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
