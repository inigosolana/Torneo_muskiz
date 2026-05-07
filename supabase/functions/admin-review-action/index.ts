import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const N8N_WH_URL = Deno.env.get("N8N_WH_URL");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
const TELEGRAM_VIEWER_CHAT_IDS = Deno.env.get("TELEGRAM_VIEWER_CHAT_IDS");
const TELEGRAM_NOTIFICATIONS_BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN");
const PLAYER_DOCS_TELEGRAM_BOT_TOKEN = Deno.env.get("PLAYER_DOCS_TELEGRAM_BOT_TOKEN")?.trim();
const OPS_ALERT_URL = `${SUPABASE_URL}/functions/v1/notify-ops-alert`;
const HANDLE_APPROVAL_URL = `${SUPABASE_URL}/functions/v1/handle-approval`;
const HANDLE_REJECTION_URL = `${SUPABASE_URL}/functions/v1/handle-rejection`;
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";

/** Cabeceras para invocar otras Edge Functions del mismo proyecto (JWT verification activada). */
function internalSupabaseFnHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const key = SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (key) {
    h.Authorization = `Bearer ${key}`;
    h.apikey = key;
  }
  return h;
}

function escHtmlTelegram(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseChatIds(value?: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

async function sendTelegramHtmlToChats(
  chatIds: string[],
  html: string,
  context: string,
  replyMarkup?: Record<string, unknown>,
  botTokenOverride?: string | null,
): Promise<void> {
  const token = (botTokenOverride ?? TELEGRAM_NOTIFICATIONS_BOT_TOKEN)?.trim();
  if (!token || chatIds.length === 0) return;
  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: html,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        await sendOpsAlert(
          "warning",
          `Telegram resumen falló (${context})`,
          `chat=${chatId} http=${res.status} body=${body.slice(0, 400)}`,
        );
      }
    } catch (err) {
      await sendOpsAlert(
        "warning",
        `Telegram resumen excepción (${context})`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }));
}

const encoder = new TextEncoder();

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function mergeChatIds(...values: Array<string | undefined>): string | null {
  const unique = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const id of value.split(",").map((v) => v.trim()).filter(Boolean)) {
      unique.add(id);
    }
  }
  const result = Array.from(unique);
  return result.length > 0 ? result.join(",") : null;
}

function htmlResponse(html: string, status = 200) {
  // Blob fija el MIME de forma explícita; algunos WebViews (p. ej. Telegram) muestran el HTML
  // como texto plano si solo se pasa string sin Content-Type claro.
  const body = new Blob([html], { type: "text/html;charset=utf-8" });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function renderActionPage(params: {
  title: string;
  subtitle: string;
  success?: boolean;
  showForm?: boolean;
  formFieldsHtml?: string;
  formActionUrl?: string;
  openInBrowserUrl?: string;
  urlHostMismatch?: { requestHost: string; expectedHost: string };
}) {
  const {
    title,
    subtitle,
    success = true,
    showForm = false,
    formFieldsHtml = "",
    formActionUrl = "",
    openInBrowserUrl,
    urlHostMismatch,
  } = params;
  const color = success ? "#15803d" : "#b91c1c";
  const bg = success ? "#f0fdf4" : "#fef2f2";
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="font-family:Segoe UI,Tahoma,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:620px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
      ${
        urlHostMismatch
          ? `<div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:8px;margin:0 0 16px;color:#991b1b;font-size:13px;line-height:1.5;">
            <strong>URL incorrecta.</strong> Este enlace usa <code style="background:#fee2e2;padding:2px 6px;border-radius:4px;">${escAttr(urlHostMismatch.requestHost)}</code>
            pero el proyecto configurado es <code style="background:#fee2e2;padding:2px 6px;border-radius:4px;">${escAttr(urlHostMismatch.expectedHost)}</code>.
            Corrige el secreto <code>SUPABASE_URL</code> en Edge Functions (debe ser <code>https://${escAttr(urlHostMismatch.expectedHost)}</code>) y pide un <strong>nuevo</strong> aviso en Telegram.
          </div>`
          : ""
      }
      <h1 style="margin:0 0 8px;color:${color};font-size:22px;">${title}</h1>
      <p style="margin:0 0 16px;color:#334155;line-height:1.5;">${subtitle}</p>
      ${
        showForm && openInBrowserUrl
          ? `<p style="margin:0 0 12px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;line-height:1.5;color:#1e40af;">
            <strong>Desde Telegram:</strong> toca primero
            <a href="${escAttr(openInBrowserUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;font-weight:800;">abrir en Chrome o Safari</a>
            y confirma ahí. Al pulsar el botón, el envío se abre en <strong>nueva pestaña</strong> para evitar el visor embebido.
          </p>`
          : ""
      }
      ${
        showForm
          ? `<p style="font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45;">Los avisos de consola «sandbox» / «Unsafe attempt» suelen ser del visor de Telegram o extensiones; el formulario no depende de JavaScript.</p>
          <form method="POST" action="${formActionUrl ? escAttr(formActionUrl) : ""}" target="_blank" style="background:${bg};border:1px solid #e2e8f0;border-radius:10px;padding:14px;">${formFieldsHtml}</form>`
          : `<div style="background:${bg};border:1px solid #e2e8f0;border-radius:10px;padding:14px;color:#334155;">Puedes cerrar esta pestaña y volver a Telegram.</div>`
      }
    </div>
  </body>
</html>`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as Record<string, unknown>;
    const message = maybe.message ?? maybe.error_description ?? maybe.error;
    if (typeof message === "string" && message.trim().length > 0) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

async function sendOpsAlert(severity: "info" | "warning" | "error" | "critical", message: string, details: string) {
  try {
    const res = await fetch(OPS_ALERT_URL, {
      method: "POST",
      headers: internalSupabaseFnHeaders(),
      body: JSON.stringify({
        source: "backend.admin-review-action",
        severity,
        message,
        details,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[admin-review sendOpsAlert] http=${res.status} body=${t.slice(0, 400)}`);
    }
  } catch (e) {
    console.error("[admin-review sendOpsAlert] fetch error", e);
  }
}

async function sendManagerEmail(action: "approve" | "reject", team: {
  name?: string;
  division?: string;
  manager_name?: string;
  manager_email?: string;
}, rejectionReason?: string) {
  if (!team.manager_email) {
    await sendOpsAlert(
      "warning",
      `Sin email del responsable para ${action} de equipo`,
      `team=${team.name ?? "?"} division=${team.division ?? "?"}`,
    );
    return;
  }
  const url = action === "approve" ? HANDLE_APPROVAL_URL : HANDLE_REJECTION_URL;
  const body = action === "approve"
    ? {
        teamName: team.name ?? "Equipo",
        managerName: team.manager_name ?? "Responsable",
        managerEmail: team.manager_email,
        division: team.division ?? "N/D",
      }
    : {
        teamName: team.name ?? "Equipo",
        managerName: team.manager_name ?? "Responsable",
        managerEmail: team.manager_email,
        division: team.division ?? "N/D",
        rejectionReason: rejectionReason ?? "No cumple los requisitos de validación",
      };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: internalSupabaseFnHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      await sendOpsAlert(
        "error",
        `Email al responsable de equipo falló (${action})`,
        `team=${team.name ?? "?"} email=${team.manager_email} http=${res.status} body=${text.slice(0, 400)}`,
      );
    }
  } catch (e) {
    await sendOpsAlert(
      "error",
      `Email al responsable de equipo excepción (${action})`,
      `team=${team.name ?? "?"} email=${team.manager_email} err=${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function sendAdminReceipt(action: "approve" | "reject", team: {
  name?: string;
  division?: string;
  manager_name?: string;
  manager_email?: string;
}, rejectionReason?: string) {
  if (!RESEND_API_KEY) {
    await sendOpsAlert(
      "warning",
      "RESEND_API_KEY sin configurar",
      "El admin no recibirá recibo de revisión de equipos.",
    );
    return;
  }
  const actionLabel = action === "approve" ? "APROBADO" : "DENEGADO";
  const reasonBlock = action === "reject" ? `<p><strong>Motivo:</strong> ${rejectionReason ?? "No informado"}</p>` : "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `Comprobante revisión equipo: ${actionLabel} - ${team.name ?? "Equipo"}`,
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:18px;">
            <h2 style="margin:0 0 10px;">Comprobante de revisión</h2>
            <p><strong>Resultado:</strong> ${actionLabel}</p>
            <p><strong>Equipo:</strong> ${team.name ?? "N/D"}</p>
            <p><strong>Categoría:</strong> ${team.division ?? "N/D"}</p>
            <p><strong>Responsable:</strong> ${team.manager_name ?? "N/D"} (${team.manager_email ?? "N/D"})</p>
            ${reasonBlock}
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await sendOpsAlert(
        "warning",
        `Recibo admin equipo falló (${action})`,
        `team=${team.name ?? "?"} http=${res.status} body=${text.slice(0, 400)}`,
      );
    }
  } catch (e) {
    await sendOpsAlert(
      "warning",
      `Recibo admin equipo excepción (${action})`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function sendTeamReviewTelegram(
  supabase: ReturnType<typeof createClient>,
  action: "approve" | "reject",
  team: { id?: string; name?: string; division?: string; manager_name?: string },
  rejectionReason?: string,
) {
  const capacity = await getCategoryCapacitySummary(supabase);
  const categoryLine = capacity.find((c) => c.category === (team.division ?? "")) ??
    { category: team.division ?? "N/D", remaining: 0, maxTeams: 0 };
  const ok = action === "approve";
  const tick = ok ? "✅" : "❌";
  const titleColor = ok ? "EQUIPO APROBADO" : "EQUIPO DENEGADO";
  const motivoLineHtml = !ok && rejectionReason
    ? `\n<b>📝 Motivo:</b> <i>${escHtmlTelegram(rejectionReason)}</i>`
    : "";
  const motivoLinePlain = !ok && rejectionReason ? `\nMotivo: ${rejectionReason}` : "";
  const undoNote = !ok
    ? "\n<i>El equipo ha sido eliminado de la BBDD; el responsable debe inscribirse de nuevo si quieres recuperarlo.</i>"
    : "";
  const html = [
    `${tick} <b>${titleColor}</b>`,
    "",
    `🏐 <b>${escHtmlTelegram(team.name ?? "N/D")}</b> (${escHtmlTelegram(team.division ?? "N/D")})`,
    `👤 ${escHtmlTelegram(team.manager_name ?? "N/D")}`,
    `🎟️ Plazas restantes ${escHtmlTelegram(categoryLine.category)}: <b>${categoryLine.remaining}/${categoryLine.maxTeams}</b>`,
    motivoLineHtml,
    undoNote,
  ].filter((line) => line !== "").join("\n");
  const plain = [
    `${tick} ${titleColor}`,
    "",
    `Equipo: ${team.name ?? "N/D"} (${team.division ?? "N/D"})`,
    `Responsable: ${team.manager_name ?? "N/D"}`,
    `Plazas restantes ${categoryLine.category}: ${categoryLine.remaining}/${categoryLine.maxTeams}`,
    motivoLinePlain,
  ].filter((line) => line !== "").join("\n");

  // Botón Deshacer SOLO en aprobación de equipo (en rechazo se elimina, no es reversible).
  const undoMarkup = ok && team.id
    ? { inline_keyboard: [[{ text: "🔁 Deshacer (volver a pendiente)", callback_data: `t:u:${team.id}` }]] }
    : undefined;

  // 1) Envío directo HTML al chat de admins (con tick).
  await sendTelegramHtmlToChats(parseChatIds(TELEGRAM_ADMIN_CHAT_IDS), html, `team-${action}`, undoMarkup);

  // 2) n8n: solo viewer/read-only para no duplicar.
  if (N8N_WH_URL && TELEGRAM_VIEWER_CHAT_IDS) {
    try {
      const res = await fetch(N8N_WH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: action === "approve" ? "team-approved" : "team-rejected",
          adminChatIds: TELEGRAM_VIEWER_CHAT_IDS,
          message: plain,
        }),
      });
      if (!res.ok) {
        await sendOpsAlert(
          "warning",
          "n8n resumen equipo falló",
          `http=${res.status} action=${action}`,
        );
      }
    } catch (notifyError) {
      await sendOpsAlert(
        "warning",
        "n8n resumen equipo excepción",
        notifyError instanceof Error ? notifyError.message : String(notifyError),
      );
    }
  }
}

async function sendBulkRegistrationAdminReceipt(
  action: "approve" | "reject",
  registration: { manager_name?: string | null; manager_email?: string | null },
  teams: Array<{ name?: string | null; division?: string | null }>,
  rejectionReason?: string,
) {
  if (!RESEND_API_KEY) {
    await sendOpsAlert(
      "warning",
      "RESEND_API_KEY sin configurar",
      "El admin no recibirá recibo de inscripción conjunta.",
    );
    return;
  }
  const actionLabel = action === "approve" ? "APROBADA" : "DENEGADA";
  const reasonBlock = action === "reject" ? `<p><strong>Motivo:</strong> ${rejectionReason ?? "No informado"}</p>` : "";
  const groups = new Map<string, string[]>();
  for (const t of teams) {
    const d = String(t.division ?? "Sin categoría");
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(String(t.name ?? "N/D"));
  }
  const groupedTeamsHtml = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([div, names]) =>
      `<div style="margin-bottom:14px;border-left:3px solid #0d9488;padding-left:12px;">
        <p style="margin:0 0 6px;font-weight:700;color:#0f172a;">${escHtmlTelegram(div)} <span style="font-size:12px;color:#64748b;">(${names.length} equipo${names.length === 1 ? "" : "s"})</span></p>
        <ul style="margin:0;padding-left:18px;color:#334155;">${names.map((n) => `<li>${escHtmlTelegram(n)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `Inscripción conjunta ${actionLabel} — ${teams.length} equipo(s)`,
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:18px;">
            <h2 style="margin:0 0 10px;">Comprobante de revisión (inscripción conjunta)</h2>
            <p><strong>Resultado:</strong> ${actionLabel}</p>
            <p><strong>Responsable:</strong> ${registration.manager_name ?? "N/D"} (${registration.manager_email ?? "N/D"})</p>
            <p><strong>Resumen por categoría</strong> (misma inscripción / un solo justificante):</p>
            ${groupedTeamsHtml}
            ${reasonBlock}
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await sendOpsAlert(
        "warning",
        `Recibo admin inscripción conjunta falló (${action})`,
        `http=${res.status} body=${text.slice(0, 400)}`,
      );
    }
  } catch (e) {
    await sendOpsAlert(
      "warning",
      `Recibo admin inscripción conjunta excepción (${action})`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function sendRegistrationBulkReviewTelegram(
  supabase: ReturnType<typeof createClient>,
  action: "approve" | "reject",
  teams: Array<{ name?: string | null; division?: string | null; manager_name?: string | null }>,
  rejectionReason?: string,
) {
  const capacity = await getCategoryCapacitySummary(supabase);
  const teamLines = teams.map((t) =>
    `🏐 <b>${escHtmlTelegram(t.name ?? "N/D")}</b> (${escHtmlTelegram(t.division ?? "N/D")})`
  );
  const categoriesAffected = new Set(teams.map((t) => t.division ?? "").filter(Boolean));
  const capLines = capacity
    .filter((c) => categoriesAffected.has(c.category))
    .map((c) => `🎟️ Plazas <b>${escHtmlTelegram(c.category)}</b>: ${c.remaining}/${c.maxTeams}`);
  const ok = action === "approve";
  const motivoLine = !ok && rejectionReason
    ? `\n\n<b>📝 Motivo:</b> <i>${escHtmlTelegram(rejectionReason)}</i>\n<i>(enviado al responsable por correo)</i>`
    : "";
  const undoNote = !ok
    ? "\n<i>Se han eliminado los equipos de la base de datos; el responsable debe inscribirse de nuevo si procede.</i>"
    : "";
  const html = [
    `${ok ? "✅" : "❌"} <b>INSCRIPCIÓN ${ok ? "APROBADA" : "DENEGADA"}</b> (${teams.length} equipos)`,
    "",
    `👤 ${escHtmlTelegram(teams[0]?.manager_name ?? "N/D")}`,
    "",
    ...teamLines,
    "",
    ...capLines,
    motivoLine,
    undoNote,
  ].filter((line) => line !== "").join("\n");
  const plain = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");

  await sendTelegramHtmlToChats(parseChatIds(TELEGRAM_ADMIN_CHAT_IDS), html, `registration-bulk-${action}`);

  if (N8N_WH_URL && TELEGRAM_VIEWER_CHAT_IDS) {
    try {
      const res = await fetch(N8N_WH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: action === "approve" ? "registration-bulk-approved" : "registration-bulk-rejected",
          adminChatIds: TELEGRAM_VIEWER_CHAT_IDS,
          message: plain.slice(0, 3500),
        }),
      });
      if (!res.ok) {
        await sendOpsAlert("warning", "n8n resumen inscripción conjunta falló", `http=${res.status} action=${action}`);
      }
    } catch (notifyError) {
      await sendOpsAlert(
        "warning",
        "n8n resumen inscripción conjunta excepción",
        notifyError instanceof Error ? notifyError.message : String(notifyError),
      );
    }
  }
}

async function sendPlayerDocReviewTelegram(
  supabase: ReturnType<typeof createClient>,
  action: "approve" | "reject",
  docType: "dni" | "insurance",
  playerId: string,
  rejectionReason?: string,
) {
  const ok = action === "approve";
  const tick = ok ? "✅" : "❌";
  const docLabel = docType === "dni" ? "DNI" : "SEGURO";

  const { data: player } = await supabase
    .from("players")
    .select("name, surnames, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return;
  const playerName = [player.name, player.surnames].filter(Boolean).join(" ").trim() || "Jugador";

  const { data: team } = await supabase
    .from("teams")
    .select("name, division, manager_name, manager_email")
    .eq("id", player.team_id)
    .maybeSingle();

  const motivoLineHtml = !ok && rejectionReason
    ? `\n📝 <b>Motivo:</b> <i>${escHtmlTelegram(rejectionReason)}</i>\n<i>(enviado al responsable por correo)</i>`
    : "";
  const motivoLinePlain = !ok && rejectionReason
    ? `\nMotivo: ${rejectionReason} (enviado al responsable por correo)`
    : "";

  const html = [
    `${tick} <b>${docLabel} ${ok ? "APROBADO" : "DENEGADO"}</b>`,
    "",
    `👤 <b>${escHtmlTelegram(playerName)}</b>`,
    `🏐 ${escHtmlTelegram(team?.name ?? "N/D")} (${escHtmlTelegram(team?.division ?? "N/D")})`,
    `👔 ${escHtmlTelegram(team?.manager_name ?? "N/D")} · 📧 ${escHtmlTelegram(team?.manager_email ?? "N/D")}`,
    motivoLineHtml,
  ].filter((line) => line !== "").join("\n");
  const plain = [
    `${tick} ${docLabel} ${ok ? "APROBADO" : "DENEGADO"}`,
    "",
    `Jugador: ${playerName}`,
    `Equipo: ${team?.name ?? "N/D"} (${team?.division ?? "N/D"})`,
    `Responsable: ${team?.manager_name ?? "N/D"} · ${team?.manager_email ?? "N/D"}`,
    motivoLinePlain,
  ].filter((line) => line !== "").join("\n");

  // 1) Directo al chat admin (HTML con tick).
  const docKey = docType === "dni" ? "d" : "i";
  const undoMarkup = {
    inline_keyboard: [[
      { text: "🔁 Deshacer (volver a PENDING)", callback_data: `p:u:${docKey}:${playerId}` },
    ]],
  };
  if (!PLAYER_DOCS_TELEGRAM_BOT_TOKEN) {
    await sendOpsAlert(
      "warning",
      "PLAYER_DOCS_TELEGRAM_BOT_TOKEN sin configurar",
      "No se envía resumen de revisión DNI/seguro al Telegram del bot de jugadores.",
    );
    return;
  }
  await sendTelegramHtmlToChats(
    parseChatIds(TELEGRAM_ADMIN_CHAT_IDS),
    html,
    `${docType}-${action}`,
    undoMarkup,
    PLAYER_DOCS_TELEGRAM_BOT_TOKEN,
  );

  // 2) n8n: solo viewer.
  if (N8N_WH_URL && TELEGRAM_VIEWER_CHAT_IDS) {
    try {
      const res = await fetch(N8N_WH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: action === "approve" ? "player-doc-approved" : "player-doc-rejected",
          adminChatIds: TELEGRAM_VIEWER_CHAT_IDS,
          message: plain,
        }),
      });
      if (!res.ok) {
        await sendOpsAlert(
          "warning",
          "n8n resumen doc falló",
          `http=${res.status} docType=${docType} action=${action}`,
        );
      }
    } catch (notifyError) {
      await sendOpsAlert(
        "warning",
        "n8n resumen doc excepción",
        notifyError instanceof Error ? notifyError.message : String(notifyError),
      );
    }
  }
}

async function sendPlayerDocAdminReceipt(
  action: "approve" | "reject",
  docType: "dni" | "insurance",
  player: { name?: string; surnames?: string },
  team: { name?: string; division?: string; manager_name?: string; manager_email?: string },
  rejectionReason?: string,
) {
  if (!RESEND_API_KEY) {
    await sendOpsAlert("warning", "RESEND_API_KEY sin configurar", "El admin no recibirá recibo de DNI/Seguro.");
    return;
  }
  const ok = action === "approve";
  const docLabel = docType === "dni" ? "DNI / identificación" : "Seguro médico o federativo";
  const tick = ok ? "✅" : "❌";
  const stateLabel = ok ? "APROBADO" : "DENEGADO";
  const playerName = [player.name, player.surnames].filter(Boolean).join(" ").trim() || "Jugador";
  const reasonBlock = !ok
    ? `<p style="margin:8px 0;"><strong>Motivo enviado al responsable:</strong></p>
       <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;white-space:pre-wrap;">${rejectionReason ?? "No informado"}</div>`
    : "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `${tick} ${docLabel} ${stateLabel} — ${playerName}`,
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:18px;line-height:1.55;">
            <h2 style="margin:0 0 10px;color:${ok ? "#15803d" : "#b91c1c"};">${tick} ${docLabel} ${stateLabel}</h2>
            <p><strong>Jugador:</strong> ${playerName}</p>
            <p><strong>Equipo:</strong> ${team.name ?? "N/D"}</p>
            <p><strong>Categoría:</strong> ${team.division ?? "N/D"}</p>
            <p><strong>Responsable:</strong> ${team.manager_name ?? "N/D"} (${team.manager_email ?? "N/D"})</p>
            ${reasonBlock}
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await sendOpsAlert(
        "warning",
        `Recibo admin DNI/Seguro falló (${action})`,
        `player=${playerName} doc=${docType} http=${res.status} body=${text.slice(0, 400)}`,
      );
    }
  } catch (e) {
    await sendOpsAlert(
      "warning",
      `Recibo admin DNI/Seguro excepción (${action})`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(REVIEW_ACTION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getCategoryCapacitySummary(supabase: ReturnType<typeof createClient>) {
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("name, max_teams")
    .order("name", { ascending: true });
  if (categoriesError) throw categoriesError;

  const { data: occupiedTeams, error: teamsError } = await supabase
    .from("teams")
    .select("division")
    .in("status", ["pending", "approved"]);
  if (teamsError) throw teamsError;

  const approvedByDivision = new Map<string, number>();
  for (const row of occupiedTeams ?? []) {
    const division = row.division ?? "Sin categoria";
    approvedByDivision.set(division, (approvedByDivision.get(division) ?? 0) + 1);
  }

  return (categories ?? []).map((category) => {
    const maxTeams = Number(category.max_teams ?? 0);
    const used = approvedByDivision.get(category.name) ?? 0;
    const remaining = Math.max(maxTeams - used, 0);
    return {
      category: category.name,
      maxTeams,
      used,
      remaining,
    };
  });
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVIEW_ACTION_SECRET) {
    return htmlResponse(renderActionPage({
      title: "Configuración incompleta",
      subtitle: "Faltan variables de entorno para ejecutar esta acción.",
      success: false,
    }), 500);
  }

  const isPost = req.method === "POST";
  let entity: string | null;
  let id: string | null;
  let action: string | null;
  let docType: string | null;
  let exp: string | null;
  let token: string | null;
  let rejectionReason = "";

  if (isPost) {
    const form = await req.formData();
    entity = String(form.get("entity") ?? "");
    id = String(form.get("id") ?? "");
    action = String(form.get("action") ?? "");
    docType = String(form.get("docType") ?? "");
    exp = String(form.get("exp") ?? "");
    token = String(form.get("token") ?? "");
    rejectionReason = String(form.get("rejectionReason") ?? "").trim();
  } else {
    const url = new URL(req.url);
    entity = url.searchParams.get("entity");
    id = url.searchParams.get("id");
    action = url.searchParams.get("action");
    docType = url.searchParams.get("docType");
    exp = url.searchParams.get("exp");
    token = url.searchParams.get("token");
    rejectionReason = String(url.searchParams.get("rejectionReason") ?? "").trim();
  }

  if (!entity || !id || !action || !exp || !token) {
    return htmlResponse(renderActionPage({
      title: "Solicitud inválida",
      subtitle: "Faltan parámetros obligatorios en el enlace.",
      success: false,
    }), 400);
  }

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return htmlResponse(renderActionPage({
      title: "Enlace caducado",
      subtitle: "La acción ya no está disponible, solicita un enlace nuevo.",
      success: false,
    }), 410);
  }

  const payload = [entity, id, action, docType ?? "", exp].join("|");
  const expected = await sign(payload);
  if (expected !== token) {
    return htmlResponse(renderActionPage({
      title: "Token inválido",
      subtitle: "No se ha podido verificar la firma del enlace.",
      success: false,
    }), 401);
  }

  // En Telegram WebView el POST del formulario queda bloqueado por sandbox.
  // Ejecutamos las acciones firmadas en un solo GET tanto para team como player-doc.

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

    if (entity === "team") {
      if (action !== "approve" && action !== "reject" && action !== "undo") {
        throw new Error("Acción de equipo no soportada.");
      }

      const { data: currentTeam, error: teamLookupError } = await supabase
        .from("teams")
        .select("id, name, division, manager_name, manager_email, registration_id, status")
        .eq("id", id)
        .maybeSingle();
      if (teamLookupError) throw teamLookupError;
      if (!currentTeam) {
        await sendOpsAlert(
          "warning",
          "Team action already processed or missing",
          `entity=team; action=${action}; id=${id}`,
        );
        return htmlResponse(renderActionPage({
          title: "Acción ya procesada",
          subtitle: `Este equipo ya no existe o ya fue revisado (${id}).`,
          success: false,
        }));
      }

      // UNDO: equipo aprobado vuelve a pending. Los rechazos no son reversibles
      // porque ya se elimina el equipo (no podríamos llegar aquí en ese caso).
      if (action === "undo") {
        const { error } = await supabase
          .from("teams")
          .update({ status: "pending", payment_feedback: null })
          .eq("id", id);
        if (error) throw error;
        await sendTelegramHtmlToChats(
          parseChatIds(TELEGRAM_ADMIN_CHAT_IDS),
          [
            `🔁 <b>EQUIPO VUELVE A PENDIENTE</b>`,
            ``,
            `🏐 <b>${escHtmlTelegram(currentTeam.name ?? "N/D")}</b> (${escHtmlTelegram(currentTeam.division ?? "N/D")})`,
            `<i>Se ha deshecho la aprobación. Vuelve a revisarlo cuando puedas.</i>`,
          ].join("\n"),
          "team-undo",
        );
        return htmlResponse(renderActionPage({
          title: "Aprobación deshecha",
          subtitle: `El equipo vuelve a pendiente (${id}).`,
          success: true,
        }));
      }

      if (action === "reject") {
        if (!rejectionReason) {
          rejectionReason = "La inscripción ha sido rechazada por el staff del torneo. Revisa la documentación y vuelve a realizar el alta.";
        }
        await sendManagerEmail("reject", currentTeam, rejectionReason);
        await sendAdminReceipt("reject", currentTeam, rejectionReason);
        // Rechazado => pierde la plaza y debe volver a rellenar desde cero.
        // Eliminamos jugadores + equipo y, si procede, la cabecera de registro.
        const { error: playersDeleteError } = await supabase
          .from("players")
          .delete()
          .eq("team_id", id);
        if (playersDeleteError) throw playersDeleteError;

        const { error: teamDeleteError } = await supabase
          .from("teams")
          .delete()
          .eq("id", id);
        if (teamDeleteError) throw teamDeleteError;

        if (currentTeam.registration_id) {
          const { data: siblingTeams, error: siblingsError } = await supabase
            .from("teams")
            .select("id")
            .eq("registration_id", currentTeam.registration_id)
            .limit(1);
          if (siblingsError) throw siblingsError;

          if (!siblingTeams || siblingTeams.length === 0) {
            const { error: registrationDeleteError } = await supabase
              .from("registrations")
              .delete()
              .eq("id", currentTeam.registration_id);
            if (registrationDeleteError) throw registrationDeleteError;
          }
        }
      } else {
        const { data: updatedRows, error } = await supabase
          .from("teams")
          .update({
            status: "approved",
            payment_status: "PAID",
            payment_feedback: null,
          })
          .select("id")
          .eq("id", id);
        if (error) throw error;
        if (!updatedRows || updatedRows.length === 0) {
          await sendOpsAlert(
            "warning",
            "Team approve affected 0 rows",
            `entity=team; action=${action}; id=${id}`,
          );
          return htmlResponse(renderActionPage({
            title: "Acción ya procesada",
            subtitle: `El equipo ya estaba revisado o no existe (${id}).`,
            success: false,
          }));
        }
        await sendManagerEmail("approve", currentTeam);
        await sendAdminReceipt("approve", currentTeam);
      }

      await sendTeamReviewTelegram(supabase, action, currentTeam, action === "reject" ? rejectionReason : undefined);

      return htmlResponse(renderActionPage({
        title: action === "approve" ? "Equipo aprobado" : "Equipo rechazado",
        subtitle: action === "approve"
          ? `La revisión del equipo se ha guardado correctamente (${id}).`
          : `Equipo rechazado y eliminado (${id}). Motivo enviado al responsable.`,
        success: action === "approve",
      }));
    }

    if (entity === "registration") {
      if (action !== "approve" && action !== "reject") {
        throw new Error("Acción de inscripción conjunta no soportada.");
      }

      const { data: registration, error: regErr } = await supabase
        .from("registrations")
        .select("id, manager_name, manager_email")
        .eq("id", id)
        .maybeSingle();
      if (regErr) throw regErr;
      if (!registration) {
        await sendOpsAlert(
          "warning",
          "Registration action: registration missing",
          `entity=registration; action=${action}; id=${id}`,
        );
        return htmlResponse(renderActionPage({
          title: "Acción ya procesada",
          subtitle: "Esta inscripción ya no existe o ya fue tramitada.",
          success: false,
        }));
      }

      const { data: teamRows, error: teamsErr } = await supabase
        .from("teams")
        .select("id, name, division, manager_name, manager_email, status")
        .eq("registration_id", id);
      if (teamsErr) throw teamsErr;
      const teams = teamRows ?? [];
      if (teams.length === 0) {
        await sendOpsAlert("warning", "Registration sin equipos", `registration_id=${id}`);
        return htmlResponse(renderActionPage({
          title: "Sin equipos",
          subtitle: "No hay equipos vinculados a esta inscripción.",
          success: false,
        }), 404);
      }

      if (action === "approve") {
        const pendingTeamIds = teams.filter((t) => t.status === "pending").map((t) => t.id);
        if (pendingTeamIds.length === 0) {
          return htmlResponse(renderActionPage({
            title: "Acción ya procesada",
            subtitle: "Todos los equipos de esta inscripción ya estaban revisados.",
            success: false,
          }));
        }
        const { error: upErr } = await supabase
          .from("teams")
          .update({
            status: "approved",
            payment_status: "PAID",
            payment_feedback: null,
          })
          .in("id", pendingTeamIds);
        if (upErr) throw upErr;

        const approvedTeamDetails = teams.filter((t) => pendingTeamIds.includes(t.id));
        const managerName = registration.manager_name ?? approvedTeamDetails[0]?.manager_name ?? "Responsable";
        const managerEmail = registration.manager_email ?? approvedTeamDetails[0]?.manager_email ?? "";
        if (!managerEmail) {
          await sendOpsAlert(
            "error",
            "Inscripción conjunta aprobada sin email de responsable",
            `registration_id=${id}`,
          );
        } else {
          const approvalRes = await fetch(HANDLE_APPROVAL_URL, {
            method: "POST",
            headers: internalSupabaseFnHeaders(),
            body: JSON.stringify({
              bulkRegistrationApproval: true,
              managerName,
              managerEmail,
              teams: approvedTeamDetails.map((t) => ({ teamName: t.name ?? "Equipo", division: t.division ?? "N/D" })),
            }),
          });
          if (!approvalRes.ok) {
            const snippet = (await approvalRes.text()).slice(0, 500);
            await sendOpsAlert(
              "error",
              "handle-approval (inscripción conjunta) falló",
              `registration_id=${id} http=${approvalRes.status} body=${snippet}`,
            );
          }
        }

        await sendBulkRegistrationAdminReceipt("approve", registration, approvedTeamDetails);
        await sendRegistrationBulkReviewTelegram(supabase, "approve", approvedTeamDetails);

        return htmlResponse(renderActionPage({
          title: "Inscripción aprobada",
          subtitle: `Se han aprobado ${pendingTeamIds.length} equipo(s) vinculados a esta inscripción.`,
          success: true,
        }));
      }

      if (!rejectionReason) {
        rejectionReason =
          "La inscripción conjunta ha sido rechazada por el staff del torneo. Revisa la documentación y vuelve a realizar el alta.";
      }

      const managerName = registration.manager_name ?? teams[0]?.manager_name ?? "Responsable";
      const managerEmail = registration.manager_email ?? teams[0]?.manager_email ?? "";
      if (managerEmail) {
        const rejRes = await fetch(HANDLE_REJECTION_URL, {
          method: "POST",
          headers: internalSupabaseFnHeaders(),
          body: JSON.stringify({
            bulkRegistrationRejection: true,
            managerName,
            managerEmail,
            rejectionReason,
            teams: teams.map((t) => ({ teamName: t.name ?? "Equipo", division: t.division ?? "N/D" })),
          }),
        });
        if (!rejRes.ok) {
          const snippet = (await rejRes.text()).slice(0, 500);
          await sendOpsAlert(
            "error",
            "handle-rejection (inscripción conjunta) falló",
            `registration_id=${id} http=${rejRes.status} body=${snippet}`,
          );
        }
      }

      await sendBulkRegistrationAdminReceipt("reject", registration, teams, rejectionReason);

      for (const tid of teams.map((t) => t.id)) {
        const { error: playersDeleteError } = await supabase.from("players").delete().eq("team_id", tid);
        if (playersDeleteError) throw playersDeleteError;
      }
      const { error: teamsDeleteError } = await supabase.from("teams").delete().eq("registration_id", id);
      if (teamsDeleteError) throw teamsDeleteError;
      const { error: registrationDeleteError } = await supabase.from("registrations").delete().eq("id", id);
      if (registrationDeleteError) throw registrationDeleteError;

      await sendRegistrationBulkReviewTelegram(supabase, "reject", teams, rejectionReason);

      return htmlResponse(renderActionPage({
        title: "Inscripción rechazada",
        subtitle: `Se han eliminado ${teams.length} equipo(s) y la inscripción. Motivo enviado al responsable.`,
        success: false,
      }));
    }

    if (entity === "player-doc") {
      if (!docType || (docType !== "dni" && docType !== "insurance")) {
        throw new Error("Tipo de documento inválido.");
      }
      if (action !== "approve" && action !== "reject" && action !== "undo") {
        throw new Error("Acción de documento no soportada.");
      }

      const field = docType === "dni" ? "dni_status" : "insurance_status";
      const newStatus = action === "approve"
        ? "APPROVED"
        : action === "reject"
          ? "REJECTED"
          : "PENDING";
      const { data, error } = await supabase
        .from("players")
        .update({ [field]: newStatus })
        .select("id")
        .eq("id", id);

      if (error) throw error;
      if (!data || data.length === 0) {
        await sendOpsAlert(
          "warning",
          "Player document action affected 0 rows",
          `entity=player-doc; action=${action}; docType=${docType}; id=${id}`,
        );
        return htmlResponse(renderActionPage({
          title: "Acción ya procesada",
          subtitle: `El documento ya estaba revisado o el jugador no existe (${id}).`,
          success: false,
        }));
      }

      // UNDO: vuelve a PENDING. No reenviamos correo al responsable
      // (sería confuso) ni al admin; solo confirmamos en Telegram.
      if (action === "undo") {
        const { data: playerDataUndo } = await supabase
          .from("players")
          .select("name, surnames, team_id")
          .eq("id", id)
          .maybeSingle();
        const playerNameUndo = [playerDataUndo?.name, playerDataUndo?.surnames]
          .filter(Boolean).join(" ").trim() || "Jugador";
        let teamNameUndo = "N/D";
        if (playerDataUndo?.team_id) {
          const { data: tu } = await supabase
            .from("teams").select("name").eq("id", playerDataUndo.team_id).maybeSingle();
          if (tu?.name) teamNameUndo = tu.name;
        }
        const docLabelUndo = docType === "dni" ? "DNI" : "Seguro";
        if (PLAYER_DOCS_TELEGRAM_BOT_TOKEN) {
          await sendTelegramHtmlToChats(
            parseChatIds(TELEGRAM_ADMIN_CHAT_IDS),
            [
              `🔁 <b>${docLabelUndo} VUELVE A PENDING</b>`,
              ``,
              `👤 <b>${escHtmlTelegram(playerNameUndo)}</b>`,
              `🏐 ${escHtmlTelegram(teamNameUndo)}`,
              `<i>Se ha deshecho la última revisión. Pendiente de validar otra vez.</i>`,
            ].join("\n"),
            `${docType}-undo`,
            undefined,
            PLAYER_DOCS_TELEGRAM_BOT_TOKEN,
          );
        }
        return htmlResponse(renderActionPage({
          title: "Revisión deshecha",
          subtitle: `${docType.toUpperCase()} vuelve a PENDING (${id}).`,
          success: true,
        }));
      }

      // Recuperar datos para emails y Telegram (admin + responsable).
      const { data: playerInfo } = await supabase
        .from("players")
        .select("name, surnames, team_id")
        .eq("id", id)
        .maybeSingle();
      let teamInfo: {
        name?: string;
        division?: string;
        manager_name?: string;
        manager_email?: string;
      } = {};
      if (playerInfo?.team_id) {
        const { data: t } = await supabase
          .from("teams")
          .select("name, division, manager_name, manager_email")
          .eq("id", playerInfo.team_id)
          .maybeSingle();
        if (t) teamInfo = t;
      }

      const defaultRejectReason =
        "El organizador no ha podido validar el documento (legibilidad, archivo incorrecto o documento no vigente). Sube un archivo nuevo desde el panel de tu equipo. Si necesitas ayuda, contacta con la organización del torneo.";
      const effectiveRejectReason = action === "reject"
        ? (rejectionReason && rejectionReason.trim() ? rejectionReason.trim() : defaultRejectReason)
        : undefined;

      // Correo al responsable: notify-player-doc-manager-email acepta Bearer service role (llamada interna).
      try {
        const notifyUrl = `${SUPABASE_URL}/functions/v1/notify-player-doc-manager-email`;
        const resNotify = await fetch(notifyUrl, {
          method: "POST",
          headers: internalSupabaseFnHeaders(),
          body: JSON.stringify({
            playerId: id,
            docType,
            approved: action === "approve",
            rejectionReason: action === "reject" ? effectiveRejectReason : undefined,
          }),
        });
        if (!resNotify.ok) {
          const txt = await resNotify.text();
          await sendOpsAlert(
            "warning",
            "notify-player-doc-manager-email failed",
            `status=${resNotify.status} body=${txt.slice(0, 500)}`,
          );
        }
      } catch (e) {
        await sendOpsAlert("warning", "notify-player-doc-manager-email exception", getErrorMessage(e));
      }

      // Recibo al ADMIN.
      await sendPlayerDocAdminReceipt(
        action,
        docType,
        playerInfo ?? {},
        teamInfo,
        effectiveRejectReason,
      );

      // Resumen tipo tarjeta con tick a Telegram (admin + viewer).
      try {
        await sendPlayerDocReviewTelegram(supabase, action, docType, id, action === "reject" ? effectiveRejectReason : undefined);
      } catch (notifyError) {
        console.warn("No se pudo enviar resumen player-doc a Telegram:", notifyError);
      }

      const label = docType === "dni" ? "DNI" : "seguro";
      return htmlResponse(renderActionPage({
        title: action === "approve" ? `${label} aprobado` : `${label} rechazado`,
        subtitle:
          `La revisión del documento se ha guardado. Puedes cerrar esta ventana y volver a Telegram. (${id})`,
        success: action === "approve",
      }));
    }

    return htmlResponse(renderActionPage({
      title: "Entidad inválida",
      subtitle: "El enlace no apunta a una revisión reconocida.",
      success: false,
    }), 400);
  } catch (error) {
    await sendOpsAlert("error", "Error processing admin review action", getErrorMessage(error));
    return htmlResponse(renderActionPage({
      title: "Error al procesar acción",
      subtitle: getErrorMessage(error),
      success: false,
    }), 500);
  }
});
