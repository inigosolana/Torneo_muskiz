import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";
const ACTION_BASE_URL = `${SUPABASE_URL}/functions/v1/admin-review-action`;
const OPS_ALERT_URL = `${SUPABASE_URL}/functions/v1/notify-ops-alert`;

const encoder = new TextEncoder();

async function signAction(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(REVIEW_ACTION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildDocActionUrl(playerId: string, docType: "dni" | "insurance", action: "approve" | "reject"): Promise<string> {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 2);
  const payload = ["player-doc", playerId, action, docType, exp].join("|");
  const token = await signAction(payload);
  return `${ACTION_BASE_URL}?entity=player-doc&id=${playerId}&docType=${docType}&action=${action}&exp=${exp}&token=${token}`;
}

Deno.serve(async (req) => {
  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVIEW_ACTION_SECRET) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno requeridas." }), { status: 500 });
    }

    const payload = await req.json();
    const { type, record, old_record } = payload;
    if (type !== "UPDATE") return new Response(JSON.stringify({ skipped: true }), { status: 200 });

    const becamePendingDni = record.dni_status === "PENDING" && old_record?.dni_status !== "PENDING";
    const becamePendingInsurance = record.insurance_status === "PENDING" && old_record?.insurance_status !== "PENDING";

    if (!becamePendingDni && !becamePendingInsurance) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: team } = await supabase
      .from("teams")
      .select("name, manager_name, manager_email, manager_phone")
      .eq("id", record.team_id)
      .single();

    const docSections: string[] = [];
    const docLinesTelegram: string[] = [];
    const telegramButtons: Array<{ text: string; url: string }> = [];
    if (becamePendingDni) {
      const approve = await buildDocActionUrl(record.id, "dni", "approve");
      const reject = await buildDocActionUrl(record.id, "dni", "reject");
      docSections.push(`
        <div style="margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
          <p style="margin:0 0 8px;"><strong>DNI</strong> ${record.dni_url ? `- <a href="${record.dni_url}" target="_blank" rel="noopener noreferrer">Ver documento</a>` : ""}</p>
          <a href="${approve}" style="display:inline-block; margin-right:8px; background:#15803d; color:#fff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">Aprobar DNI</a>
          <a href="${reject}" style="display:inline-block; background:#b91c1c; color:#fff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">Denegar DNI</a>
        </div>
      `);
      docLinesTelegram.push(`DNI\nAprobar: ${approve}\nDenegar: ${reject}\nDocumento: ${record.dni_url || "No adjunto"}`);
      telegramButtons.push({ text: "Aprobar DNI", url: approve });
      telegramButtons.push({ text: "Denegar DNI", url: reject });
      if (record.dni_url) telegramButtons.push({ text: "Ver DNI", url: record.dni_url });
    }
    if (becamePendingInsurance) {
      const approve = await buildDocActionUrl(record.id, "insurance", "approve");
      const reject = await buildDocActionUrl(record.id, "insurance", "reject");
      docSections.push(`
        <div style="margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
          <p style="margin:0 0 8px;"><strong>Seguro</strong> ${record.insurance_url ? `- <a href="${record.insurance_url}" target="_blank" rel="noopener noreferrer">Ver documento</a>` : ""}</p>
          <a href="${approve}" style="display:inline-block; margin-right:8px; background:#15803d; color:#fff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">Aprobar seguro</a>
          <a href="${reject}" style="display:inline-block; background:#b91c1c; color:#fff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">Denegar seguro</a>
        </div>
      `);
      docLinesTelegram.push(`SEGURO\nAprobar: ${approve}\nDenegar: ${reject}\nDocumento: ${record.insurance_url || "No adjunto"}`);
      telegramButtons.push({ text: "Aprobar seguro", url: approve });
      telegramButtons.push({ text: "Denegar seguro", url: reject });
      if (record.insurance_url) telegramButtons.push({ text: "Ver seguro", url: record.insurance_url });
    }

    const messageText = `NUEVO DOCUMENTO PENDIENTE\n\nJugador: ${record.name}\nEquipo: ${team?.name ?? "N/D"}\nResponsable: ${team?.manager_name ?? "N/D"}\nCorreo: ${team?.manager_email ?? "N/D"}\n\nACCIONES:\n${docLinesTelegram.join("\n\n")}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `📄 Documentación pendiente: ${record.name}`,
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <h2 style="margin:0 0 10px;color:#0f172a;">Nueva documentación pendiente de revisión</h2>
            <p style="margin:0 0 10px;color:#475569;">Jugador: <strong>${record.name}</strong></p>
            <p style="margin:0 0 10px;color:#475569;">Equipo: <strong>${team?.name ?? "N/D"}</strong></p>
            <p style="margin:0 0 16px;color:#475569;">Responsable: <strong>${team?.manager_name ?? "N/D"}</strong> (${team?.manager_email ?? "N/D"})</p>
            ${docSections.join("")}
          </div>
        `,
      }),
    });

    const n8nWebhookUrl = Deno.env.get("N8N_WH_URL");
    const adminChatIds = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
    if (n8nWebhookUrl) {
      await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "player-documents",
          managerName: team?.manager_name ?? "Responsable",
          managerEmail: team?.manager_email ?? "N/D",
          managerPhone: team?.manager_phone ?? "N/D",
          teamsCount: 0,
          adminChatIds,
          telegramButtons,
          message: messageText,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    try {
      await fetch(OPS_ALERT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "backend.webhook-player-documents",
          severity: "critical",
          message: "Error in webhook-player-documents",
          details: error instanceof Error ? error.message : String(error),
        }),
      });
    } catch {
      // ignore alert failures
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500 });
  }
});
