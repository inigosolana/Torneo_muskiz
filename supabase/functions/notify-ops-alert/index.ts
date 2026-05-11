import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BOT_TOKEN = Deno.env.get("ALERTS_TELEGRAM_BOT_TOKEN")?.trim();
const CHAT_ID = Deno.env.get("ALERTS_TELEGRAM_CHAT_ID")?.trim();

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

/** Dedupe en memoria (reduce ráfagas Telegram por el mismo fallo en esta instancia Edge). */
const recentAlerts = new Map<string, number>();
const DEDUP_MS = 45_000;
const MAX_KEYS = 120;

function pruneOldAlerts(now: number): void {
  for (const [k, t] of recentAlerts) {
    if (now - t > DEDUP_MS) recentAlerts.delete(k);
  }
  if (recentAlerts.size > MAX_KEYS) {
    const entries = [...recentAlerts.entries()].sort((a, b) => a[1] - b[1]);
    entries.slice(0, recentAlerts.size - MAX_KEYS + 20).forEach(([k]) => recentAlerts.delete(k));
  }
}

function alertDedupKey(payload: AlertPayload): string {
  const s = `${payload.source ?? ""}|${payload.message ?? ""}|${(payload.details ?? "").slice(0, 280)}`;
  return s.length > 600 ? s.slice(0, 600) : s;
}

function laneFromSource(source: string): string {
  const s = (source || "").toLowerCase();
  if (s.startsWith("frontend.")) return "FRONTEND";
  if (s.includes("telegram-player-docs")) return "BOT JUGADORES (Telegram)";
  if (s.includes("telegram-bot-webhook")) return "BOT EQUIPOS (Telegram)";
  if (s.startsWith("backend.")) return "BACKEND";
  return "BACKEND / OTRO";
}

function formatAlert(payload: AlertPayload) {
  const source = payload.source ?? "unknown";
  const severity = (payload.severity ?? "error").toUpperCase();
  const message = payload.message ?? "Unknown alert";
  const details = payload.details ?? "";
  const lane = laneFromSource(source);
  return [
    `ALERTA ${severity}`,
    `Tipo: ${lane}`,
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
    const now = Date.now();
    pruneOldAlerts(now);
    const key = alertDedupKey(payload);
    const last = recentAlerts.get(key);
    if (last !== undefined && now - last < DEDUP_MS) {
      return new Response(JSON.stringify({ success: true, deduped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    recentAlerts.set(key, now);

    const text = formatAlert(payload);

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Telegram acepta string (evita pérdida de precisión en IDs largos de supergrupo).
        chat_id: CHAT_ID,
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
