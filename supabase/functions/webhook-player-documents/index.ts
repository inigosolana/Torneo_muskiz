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
const TELEGRAM_VIEWER_CHAT_IDS = Deno.env.get("TELEGRAM_VIEWER_CHAT_IDS");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
const TELEGRAM_NOTIFICATIONS_BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN");
const PLAYER_DOCS_TELEGRAM_BOT_TOKEN = Deno.env.get("PLAYER_DOCS_TELEGRAM_BOT_TOKEN");
const PLAYER_DOCS_TELEGRAM_VIEWER_CHAT_IDS = Deno.env.get("PLAYER_DOCS_TELEGRAM_VIEWER_CHAT_IDS");

const encoder = new TextEncoder();

function hasChatIds(value?: string | null): value is string {
  return Boolean(value && value.split(",").map((v) => v.trim()).filter(Boolean).length > 0);
}

function parseChatIds(value?: string | null): number[] {
  if (!value) return [];
  return value.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n));
}

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

function escHtmlTelegram(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function buildDocActionUrl(playerId: string, docType: "dni" | "insurance", action: "approve" | "reject"): Promise<string> {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 2);
  const payload = ["player-doc", playerId, action, docType, exp].join("|");
  const token = await signAction(payload);
  const q = new URLSearchParams({
    entity: "player-doc",
    id: playerId,
    docType,
    action,
    exp,
    token,
  });
  return `${ACTION_BASE_URL}?${q.toString()}`;
}

Deno.serve(async (req) => {
  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVIEW_ACTION_SECRET) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno requeridas." }), { status: 500 });
    }

    const payload = await req.json();
    const { type, record, old_record } = payload;
    if (type !== "UPDATE" && type !== "INSERT") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const becamePendingDni = record.dni_status === "PENDING" && old_record?.dni_status !== "PENDING";
    const becamePendingInsurance = record.insurance_status === "PENDING" && old_record?.insurance_status !== "PENDING";
    const isNewPlayer = type === "INSERT";

    if (!isNewPlayer && !becamePendingDni && !becamePendingInsurance) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: team } = await supabase
      .from("teams")
      .select("name, manager_name, manager_email, registration_id")
      .eq("id", record.team_id)
      .single();

    let managerPhoneDisplay = "N/D";
    if (team?.registration_id) {
      const { data: reg } = await supabase
        .from("registrations")
        .select("manager_phone")
        .eq("id", team.registration_id)
        .maybeSingle();
      if (reg?.manager_phone && String(reg.manager_phone).trim()) {
        managerPhoneDisplay = String(reg.manager_phone).trim();
      }
    }

    const docSections: string[] = [];
    const docLinesTelegram: string[] = [];
    // inline_keyboard para Telegram: callback_data evita abrir el navegador.
    const inlineKeyboardActions: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];
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
      docLinesTelegram.push(`DNI\nDocumento: ${record.dni_url || "No adjunto"}`);
      if (record.dni_url) {
        inlineKeyboardActions.push([{ text: "📄 Ver DNI", url: String(record.dni_url) }]);
      }
      inlineKeyboardActions.push([
        { text: "✅ Aprobar DNI", callback_data: `p:a:d:${record.id}` },
        { text: "❌ Denegar DNI", callback_data: `p:r:d:${record.id}` },
      ]);
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
      docLinesTelegram.push(`SEGURO\nDocumento: ${record.insurance_url || "No adjunto"}`);
      if (record.insurance_url) {
        inlineKeyboardActions.push([{ text: "📄 Ver seguro", url: String(record.insurance_url) }]);
      }
      inlineKeyboardActions.push([
        { text: "✅ Aprobar seguro", callback_data: `p:a:i:${record.id}` },
        { text: "❌ Denegar seguro", callback_data: `p:r:i:${record.id}` },
      ]);
    }

    const phoneLine = managerPhoneDisplay === "N/D"
      ? "N/D"
      : escHtmlTelegram(managerPhoneDisplay);

    /** Tarjeta corta tipo panel admin: sin URLs largas (van en los botones). */
    const messageHtml = isNewPlayer
      ? [
        "<b>📄 DOCUMENTACIÓN DE JUGADOR</b>",
        "<i>Nuevo jugador en plantilla</i>",
        "",
        `<b>👤 Jugador:</b> ${escHtmlTelegram(record.name)}`,
        `<b>🏐 Equipo:</b> ${escHtmlTelegram(team?.name ?? "N/D")}`,
        `<b>👔 Responsable:</b> ${escHtmlTelegram(team?.manager_name ?? "N/D")}`,
        `<b>📧 Correo:</b> ${escHtmlTelegram(team?.manager_email ?? "N/D")}`,
        `<b>📱 Teléfono:</b> ${phoneLine}`,
        "",
        `🪪 <b>DNI:</b> ${escHtmlTelegram(record.dni_status ?? "EMPTY")}`,
        `🛡️ <b>Seguro:</b> ${escHtmlTelegram(record.insurance_status ?? "EMPTY")}`,
        "",
        "<i>Pulsa los botones si hay documentos pendientes de revisión.</i>",
      ].join("\n")
      : [
        "<b>📄 DOCUMENTACIÓN DE JUGADOR</b>",
        "<i>Pendiente de revisión</i>",
        "",
        `<b>👤 Jugador:</b> ${escHtmlTelegram(record.name)}`,
        `<b>🏐 Equipo:</b> ${escHtmlTelegram(team?.name ?? "N/D")}`,
        `<b>👔 Responsable:</b> ${escHtmlTelegram(team?.manager_name ?? "N/D")}`,
        `<b>📧 Correo:</b> ${escHtmlTelegram(team?.manager_email ?? "N/D")}`,
        `<b>📱 Teléfono:</b> ${phoneLine}`,
        "",
        ...(becamePendingDni ? [`🪪 <b>DNI</b> · <code>PENDING</code> · usa los botones de abajo.`] : []),
        ...(becamePendingInsurance
          ? [`🛡️ <b>Seguro</b> · <code>PENDING</code> · usa los botones de abajo.`]
          : []),
        "",
        "<i>Pulsa los botones para revisar documentos.</i>",
      ].join("\n");

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: isNewPlayer ? `👤 Nuevo jugador añadido: ${record.name}` : `📄 Documentación pendiente: ${record.name}`,
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <h2 style="margin:0 0 10px;color:#0f172a;">${isNewPlayer ? "Nuevo jugador añadido al equipo" : "Nueva documentación pendiente de revisión"}</h2>
            <p style="margin:0 0 10px;color:#475569;">Jugador: <strong>${record.name}</strong></p>
            <p style="margin:0 0 10px;color:#475569;">Equipo: <strong>${team?.name ?? "N/D"}</strong></p>
            <p style="margin:0 0 16px;color:#475569;">Responsable: <strong>${team?.manager_name ?? "N/D"}</strong> (${team?.manager_email ?? "N/D"})</p>
            ${isNewPlayer ? `
              <p style="margin:0 0 8px;color:#334155;">Estado DNI: <strong>${record.dni_status ?? "EMPTY"}</strong></p>
              <p style="margin:0 0 8px;color:#334155;">Estado Seguro: <strong>${record.insurance_status ?? "EMPTY"}</strong></p>
            ` : docSections.join("")}
          </div>
        `,
      }),
    });

    // n8n: solo a chat read-only (sin botones), nunca al chat admin para evitar duplicados.
    const n8nWebhookUrl = Deno.env.get("N8N_WH_URL");
    const notifyPlayerDocsToN8n = Deno.env.get("N8N_NOTIFY_PLAYER_DOCUMENTS") === "true";
    if (n8nWebhookUrl && notifyPlayerDocsToN8n && hasChatIds(TELEGRAM_VIEWER_CHAT_IDS)) {
      await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "player-documents",
          managerName: team?.manager_name ?? "Responsable",
          managerEmail: team?.manager_email ?? "N/D",
          managerPhone: managerPhoneDisplay,
          teamsCount: 0,
          adminChatIds: TELEGRAM_VIEWER_CHAT_IDS,
          telegramButtons: [],
          message: `NUEVO DOCUMENTO PENDIENTE (SOLO LECTURA)\n\nJugador: ${record.name}\nEquipo: ${team?.name ?? "N/D"}\nResponsable: ${team?.manager_name ?? "N/D"}\nCorreo: ${team?.manager_email ?? "N/D"}\n\nDocumentos:\n${docLinesTelegram.join("\n\n")}`,
        }),
      });
    }

    // Envío DIRECTO al bot principal (KOLOSAURIOS) con botones callback_data.
    // Aprobar/denegar se ejecuta dentro de Telegram, sin abrir navegador.
    const adminChatList = parseChatIds(TELEGRAM_ADMIN_CHAT_IDS);
    if (TELEGRAM_NOTIFICATIONS_BOT_TOKEN && adminChatList.length > 0 && inlineKeyboardActions.length > 0) {
      await Promise.all(adminChatList.map(async (chatId) => {
        try {
          const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_NOTIFICATIONS_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: String(chatId),
              text: messageHtml,
              parse_mode: "HTML",
              disable_web_page_preview: true,
              reply_markup: { inline_keyboard: inlineKeyboardActions },
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            try {
              await fetch(OPS_ALERT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source: "backend.webhook-player-documents",
                  severity: "error",
                  message: "Telegram sendMessage doc jugador falló",
                  details: `chat=${chatId} http=${res.status} body=${body.slice(0, 400)} player=${record.id}`,
                }),
              });
            } catch {
              // ignore alert failures
            }
          }
        } catch (err) {
          try {
            await fetch(OPS_ALERT_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "backend.webhook-player-documents",
                severity: "error",
                message: "Telegram direct send excepción (doc jugador)",
                details: err instanceof Error ? err.message : String(err),
              }),
            });
          } catch {
            // ignore alert failures
          }
        }
      }));
    }
    if (PLAYER_DOCS_TELEGRAM_BOT_TOKEN && hasChatIds(PLAYER_DOCS_TELEGRAM_VIEWER_CHAT_IDS)) {
      const viewerChats = parseChatIds(PLAYER_DOCS_TELEGRAM_VIEWER_CHAT_IDS);
      const readOnlyHtml = isNewPlayer
        ? [
          "<b>📄 DOCUMENTACIÓN DE JUGADOR</b> <i>(solo lectura)</i>",
          "",
          `<b>👤 Jugador:</b> ${escHtmlTelegram(record.name)}`,
          `<b>🏐 Equipo:</b> ${escHtmlTelegram(team?.name ?? "N/D")}`,
          `<b>👔 Responsable:</b> ${escHtmlTelegram(team?.manager_name ?? "N/D")}`,
          `<b>📧 Correo:</b> ${escHtmlTelegram(team?.manager_email ?? "N/D")}`,
          `<b>📱 Teléfono:</b> ${phoneLine}`,
          "",
          `🪪 DNI: <b>${escHtmlTelegram(record.dni_status ?? "EMPTY")}</b>`,
          `🛡️ Seguro: <b>${escHtmlTelegram(record.insurance_status ?? "EMPTY")}</b>`,
        ].join("\n")
        : [
          "<b>📄 DOCUMENTACIÓN DE JUGADOR</b> <i>(solo lectura)</i>",
          "",
          `<b>👤 Jugador:</b> ${escHtmlTelegram(record.name)}`,
          `<b>🏐 Equipo:</b> ${escHtmlTelegram(team?.name ?? "N/D")}`,
          `<b>👔 Responsable:</b> ${escHtmlTelegram(team?.manager_name ?? "N/D")}`,
          `<b>📧 Correo:</b> ${escHtmlTelegram(team?.manager_email ?? "N/D")}`,
          `<b>📱 Teléfono:</b> ${phoneLine}`,
          ...(becamePendingDni ? ["", "🪪 <b>DNI</b> · pendiente de revisión por staff."] : []),
          ...(becamePendingInsurance ? ["", "🛡️ <b>Seguro</b> · pendiente de revisión por staff."] : []),
        ].join("\n");
      for (const chatId of viewerChats) {
        await fetch(`https://api.telegram.org/bot${PLAYER_DOCS_TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: readOnlyHtml,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
      }
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
