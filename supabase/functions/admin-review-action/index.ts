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
const OPS_ALERT_URL = `${SUPABASE_URL}/functions/v1/notify-ops-alert`;
const HANDLE_APPROVAL_URL = `${SUPABASE_URL}/functions/v1/handle-approval`;
const HANDLE_REJECTION_URL = `${SUPABASE_URL}/functions/v1/handle-rejection`;
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";

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

async function sendTelegramHtmlToChats(chatIds: string[], html: string, context: string): Promise<void> {
  if (!TELEGRAM_NOTIFICATIONS_BOT_TOKEN || chatIds.length === 0) return;
  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_NOTIFICATIONS_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: html,
          parse_mode: "HTML",
          disable_web_page_preview: true,
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
    await fetch(OPS_ALERT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "backend.admin-review-action",
        severity,
        message,
        details,
      }),
    });
  } catch {
    // ignore alert failures
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
      headers: { "Content-Type": "application/json" },
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
  team: { name?: string; division?: string; manager_name?: string },
) {
  const capacity = await getCategoryCapacitySummary(supabase);
  const categoryLine = capacity.find((c) => c.category === (team.division ?? "")) ??
    { category: team.division ?? "N/D", remaining: 0, maxTeams: 0 };
  const ok = action === "approve";
  const tick = ok ? "✅" : "❌";
  const titleColor = ok ? "EQUIPO APROBADO" : "EQUIPO DENEGADO";
  const html = [
    `${tick} <b>${titleColor}</b>`,
    "",
    `<b>🏐 Equipo:</b> ${escHtmlTelegram(team.name ?? "N/D")}`,
    `<b>🏷️ Categoría:</b> ${escHtmlTelegram(team.division ?? "N/D")}`,
    `<b>👤 Responsable:</b> ${escHtmlTelegram(team.manager_name ?? "N/D")}`,
    "",
    `<b>🎟️ Plazas restantes en ${escHtmlTelegram(categoryLine.category)}:</b> ${categoryLine.remaining}/${categoryLine.maxTeams}`,
    "<i>(pendientes + aprobadas ocupan plaza)</i>",
  ].join("\n");
  const plain = [
    `${tick} ${titleColor}`,
    "",
    `Equipo: ${team.name ?? "N/D"}`,
    `Categoría: ${team.division ?? "N/D"}`,
    `Responsable: ${team.manager_name ?? "N/D"}`,
    "",
    `Plazas restantes en ${categoryLine.category}: ${categoryLine.remaining}/${categoryLine.maxTeams}`,
    "(pendientes + aprobadas ocupan plaza)",
  ].join("\n");

  // 1) Envío directo HTML al chat de admins (con tick).
  await sendTelegramHtmlToChats(parseChatIds(TELEGRAM_ADMIN_CHAT_IDS), html, `team-${action}`);

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

async function sendPlayerDocReviewTelegram(
  supabase: ReturnType<typeof createClient>,
  action: "approve" | "reject",
  docType: "dni" | "insurance",
  playerId: string,
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

  const html = [
    `${tick} <b>${docLabel} ${ok ? "APROBADO" : "DENEGADO"}</b>`,
    "",
    `<b>👤 Jugador:</b> ${escHtmlTelegram(playerName)}`,
    `<b>🏐 Equipo:</b> ${escHtmlTelegram(team?.name ?? "N/D")}`,
    `<b>🏷️ Categoría:</b> ${escHtmlTelegram(team?.division ?? "N/D")}`,
    `<b>👔 Responsable:</b> ${escHtmlTelegram(team?.manager_name ?? "N/D")}`,
    `<b>📧 Correo:</b> ${escHtmlTelegram(team?.manager_email ?? "N/D")}`,
  ].join("\n");
  const plain = [
    `${tick} ${docLabel} ${ok ? "APROBADO" : "DENEGADO"}`,
    "",
    `Jugador: ${playerName}`,
    `Equipo: ${team?.name ?? "N/D"}`,
    `Categoría: ${team?.division ?? "N/D"}`,
    `Responsable: ${team?.manager_name ?? "N/D"}`,
    `Correo: ${team?.manager_email ?? "N/D"}`,
  ].join("\n");

  // 1) Directo al chat admin (HTML con tick).
  await sendTelegramHtmlToChats(parseChatIds(TELEGRAM_ADMIN_CHAT_IDS), html, `${docType}-${action}`);

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (entity === "team") {
      if (action !== "approve" && action !== "reject") {
        throw new Error("Acción de equipo no soportada.");
      }

      const { data: currentTeam, error: teamLookupError } = await supabase
        .from("teams")
        .select("id, name, division, manager_name, manager_email, registration_id")
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

      await sendTeamReviewTelegram(supabase, action, currentTeam);

      return htmlResponse(renderActionPage({
        title: action === "approve" ? "Equipo aprobado" : "Equipo rechazado",
        subtitle: action === "approve"
          ? `La revisión del equipo se ha guardado correctamente (${id}).`
          : `Equipo rechazado y eliminado (${id}). Motivo enviado al responsable.`,
        success: action === "approve",
      }));
    }

    if (entity === "player-doc") {
      if (!docType || (docType !== "dni" && docType !== "insurance")) {
        throw new Error("Tipo de documento inválido.");
      }
      if (action !== "approve" && action !== "reject") {
        throw new Error("Acción de documento no soportada.");
      }

      const field = docType === "dni" ? "dni_status" : "insurance_status";
      const { data, error } = await supabase
        .from("players")
        .update({ [field]: action === "approve" ? "APPROVED" : "REJECTED" })
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

      // Correo al RESPONSABLE (vía notify-player-doc-manager-email si tiene secret configurado).
      const notifySecret = Deno.env.get("PLAYER_DOC_NOTIFY_INTERNAL_SECRET");
      if (notifySecret) {
        try {
          const notifyUrl = `${SUPABASE_URL}/functions/v1/notify-player-doc-manager-email`;
          const resNotify = await fetch(notifyUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-player-doc-notify-secret": notifySecret,
            },
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
      } else {
        await sendOpsAlert(
          "warning",
          "PLAYER_DOC_NOTIFY_INTERNAL_SECRET no configurado",
          "El responsable no recibirá email automático de revisión de documento.",
        );
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
        await sendPlayerDocReviewTelegram(supabase, action, docType, id);
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
