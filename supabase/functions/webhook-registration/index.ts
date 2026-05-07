import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const ACTION_BASE_URL = `${SUPABASE_URL}/functions/v1/admin-review-action`;
const OPS_ALERT_URL = `${SUPABASE_URL}/functions/v1/notify-ops-alert`;
const TELEGRAM_VIEWER_CHAT_IDS = Deno.env.get("TELEGRAM_VIEWER_CHAT_IDS");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
const TELEGRAM_NOTIFICATIONS_BOT_TOKEN = Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();

function hasChatIds(value?: string | null): value is string {
  return Boolean(value && value.split(",").map((v) => v.trim()).filter(Boolean).length > 0);
}

function parseChatIds(value?: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function escHtmlTelegram(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

async function buildTeamActionUrl(teamId: string, action: "approve" | "reject"): Promise<string> {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 2);
  const payload = ["team", teamId, action, "", exp].join("|");
  const token = await signAction(payload);
  const q = new URLSearchParams({
    entity: "team",
    id: teamId,
    action,
    exp,
    token,
  });
  return `${ACTION_BASE_URL}?${q.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVIEW_ACTION_SECRET) {
      return new Response(JSON.stringify({ error: 'Faltan variables de entorno requeridas.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    console.log('Webhook payload received:', payload);

    const registration = payload.record;
    const managerName = registration.manager_name;
    const managerEmail = registration.manager_email;
    const managerPhone = registration.manager_phone ?? registration.phone ?? "No informado";

    if (!managerEmail || !registration.id) {
      throw new Error('Faltan datos en el registro de inscripción.');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch teams associated with this registration
    // Avoid race condition: registration webhook can fire before team inserts complete.
    let teams: any[] = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data: fetchedTeams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, division, city, fee, receipt_url')
        .eq('registration_id', registration.id);

      if (teamsError) throw teamsError;
      teams = fetchedTeams ?? [];
      if (teams.length > 0) break;

      console.log(`No teams yet for registration ${registration.id}. Retry ${attempt}/5`);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    if (teams.length === 0) {
      console.log('No teams found after retries for registration:', registration.id);
      try {
        await fetch(OPS_ALERT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'backend.webhook-registration',
            severity: 'warning',
            message: 'Inscripción sin equipos detectada',
            details: `registration_id=${registration.id}; manager_email=${managerEmail ?? 'N/D'}; manager_name=${managerName ?? 'N/D'}`,
          }),
        });
      } catch {
        // ignore alert failures
      }
      return new Response(JSON.stringify({ message: 'No teams to notify.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build dynamic team list HTML
    const teamListHtml = teams.map((t: any) =>
      `<li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <strong>${t.name}</strong> <span style="color: #666;">(${t.city})</span>
        <br><span style="font-size: 0.85em; color: #0d9488;">📋 ${t.division} — ${t.fee}€</span>
      </li>`
    ).join('');

    const totalFee = teams.reduce((sum: number, t: any) => sum + t.fee, 0);
    const teamSummaryForAdmin = teams.map((t: any) =>
      `<strong>${t.name}</strong> (${t.division})`
    ).join(', ');

    const teamActionsHtml = await Promise.all(
      teams.map(async (t: any) => {
        const approveUrl = await buildTeamActionUrl(t.id, "approve");
        const rejectUrl = await buildTeamActionUrl(t.id, "reject");
        return `
          <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px; margin-bottom:8px;">
            <p style="margin:0 0 6px; font-size:13px; color:#0f172a;"><strong>${t.name}</strong> (${t.division})</p>
            <p style="margin:0 0 8px; font-size:12px;">
              ${t.receipt_url ? `<a href="${t.receipt_url}" target="_blank" rel="noopener noreferrer">Ver justificante</a>` : "Sin justificante adjunto"}
            </p>
            <div>
              <a href="${approveUrl}" style="display:inline-block; margin-right:8px; background:#15803d; color:#fff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">Aprobar</a>
              <a href="${rejectUrl}" style="display:inline-block; background:#b91c1c; color:#fff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700;">Denegar</a>
            </div>
          </div>
        `;
      })
    );

    const teamSummaryLines = teams.map((t: any) => `${t.name} (${t.division})`);

    // --- 1. EMAIL AL RESPONSABLE (Comprobante) ---
    const managerEmailBody = {
      from: FROM_EMAIL,
      to: managerEmail,
      subject: `📋 Inscripción Recibida — II Torneo Muskiz Beach Handball`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #0d9488, #0ea5e9); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🏖️ II Torneo Muskiz</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">Balonmano Playa — Inscripción Recibida</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 28px 24px;">
            <h2 style="color: #1e293b; margin: 0 0 8px;">¡Hola, ${managerName}!</h2>
            <p style="color: #475569; line-height: 1.6; font-size: 14px;">
              Hemos recibido correctamente tu solicitud de inscripción. Aquí tienes el resumen:
            </p>
            
            <!-- Team List -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <h3 style="margin: 0 0 12px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Equipos Inscritos</h3>
              <ul style="list-style: none; padding: 0; margin: 0;">${teamListHtml}</ul>
              <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e2e8f0; text-align: right;">
                <span style="font-size: 18px; font-weight: bold; color: #0d9488;">Total: ${totalFee}€</span>
              </div>
            </div>
            
            <!-- Warning Box -->
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-weight: 600; color: #92400e; font-size: 14px;">⏳ Pendiente de Revisión</p>
              <p style="margin: 8px 0 0; color: #a16207; font-size: 13px; line-height: 1.5;">
                Tus equipos tienen que ser revisados por el administrador para confirmar la inscripción definitivamente. 
                <strong>Recibirás un correo cuando se apruebe o rechace.</strong>
              </p>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 24px 0 0;">
              No respondas a este correo. Si tienes dudas, contacta con la organización.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f1f5f9; padding: 16px 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">© 2026 II Torneo Balonmano Playa Muskiz · torneomuskizbmplaya.es</p>
          </div>
        </div>
      `,
    };

    // --- 2. EMAIL AL ADMINISTRADOR (Aviso) ---
    const adminEmailBody = {
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🚨 NUEVA INSCRIPCIÓN: ${managerName} — ${teams.length} equipo(s)`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
          <div style="background: linear-gradient(135deg, #dc2626, #f97316); padding: 24px;">
            <h2 style="margin:0; color:#ffffff; font-size:22px;">🚨 Nueva inscripción recibida</h2>
            <p style="margin:8px 0 0; color:#fee2e2; font-size:13px;">Requiere revisión manual del staff</p>
          </div>

          <div style="padding:20px 24px;">
            <table style="width: 100%; border-collapse: collapse; margin: 0 0 14px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Responsable</td>
                <td style="padding: 10px; color: #1e293b;">${managerName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Correo</td>
                <td style="padding: 10px; color: #1e293b;">${managerEmail}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Teléfono</td>
                <td style="padding: 10px; color: #1e293b;">${managerPhone}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Equipo(s)</td>
                <td style="padding: 10px; color: #1e293b;">${teamSummaryForAdmin}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Importe total</td>
                <td style="padding: 10px; color: #1e293b; font-weight: bold;">${totalFee}€</td>
              </tr>
            </table>

            <div style="background:#fff7ed; border:1px solid #fed7aa; border-left:4px solid #f97316; border-radius:8px; padding:12px 14px; margin: 12px 0 18px;">
              <p style="margin:0 0 6px; font-size:13px; font-weight:700; color:#9a3412;">Qué comprobar</p>
              <ul style="margin:0; padding-left:18px; color:#7c2d12; font-size:13px; line-height:1.6;">
                <li>Justificante de pago y estado de la transferencia</li>
                <li>Datos del responsable y categoría de cada equipo</li>
                <li>Disponibilidad de plazas por categoría</li>
              </ul>
            </div>

            <div style="margin: 0 0 18px;">
              <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#334155;">Acción rápida por equipo</p>
              ${teamActionsHtml.join("")}
            </div>

            <div style="text-align: center;">
              <a href="https://torneomuskizbmplaya.es/admin" style="background: #111827; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
                IR AL PANEL DE CONTROL →
              </a>
            </div>
          </div>
        </div>
      `,
    };

    console.log(`Sending registration emails. manager=${managerEmail}, teams=${teams.length}`);

    // Send both emails in parallel
    const [managerRes, adminRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify(managerEmailBody),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify(adminEmailBody),
      })
    ]);

    const managerResult = await managerRes.json();
    const adminResult = await adminRes.json();

    if (!managerRes.ok || !adminRes.ok) {
      console.error('Resend error from webhook-registration', {
        managerStatus: managerRes.status,
        adminStatus: adminRes.status,
        managerResult,
        adminResult
      });
      return new Response(JSON.stringify({ error: 'Error enviando correos', managerResult, adminResult }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Envío DIRECTO al bot principal (KOLOSAURIOS) con botones callback_data,
    // para que aprobar/denegar se ejecute dentro de Telegram (sin abrir navegador).
    const adminChatList = parseChatIds(TELEGRAM_ADMIN_CHAT_IDS);
    if (TELEGRAM_NOTIFICATIONS_BOT_TOKEN && adminChatList.length > 0) {
      const adminMessageHtml = [
        "<b>🚨 NUEVA INSCRIPCIÓN</b>",
        "",
        `👤 <b>${escHtmlTelegram(managerName)}</b> · 📞 ${escHtmlTelegram(managerPhone)}`,
        `📧 ${escHtmlTelegram(managerEmail)}`,
        `💰 Total: <b>${totalFee}€</b> · ${teams.length} equipo${teams.length === 1 ? "" : "s"}`,
        "",
        ...teams.map((t: any) =>
          `🏐 <b>${escHtmlTelegram(t.name)}</b> (${escHtmlTelegram(t.division)}) — ${t.fee}€`
        ),
        "",
        "<i>👇 Toca para revisar cada equipo.</i>",
      ].join("\n");

      const inline_keyboard: Array<Array<Record<string, string>>> = [];
      for (const t of teams) {
        if (t.receipt_url) {
          inline_keyboard.push([{ text: `📄 Ver justificante (${t.name})`, url: String(t.receipt_url) }]);
        }
        inline_keyboard.push([
          { text: `✅ ${t.name}`, callback_data: `t:a:${t.id}` },
          { text: `❌ ${t.name}`, callback_data: `t:r:${t.id}` },
        ]);
      }

      try {
        await Promise.all(adminChatList.map(async (chatId) => {
          const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_NOTIFICATIONS_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: adminMessageHtml,
              parse_mode: "HTML",
              disable_web_page_preview: true,
              reply_markup: { inline_keyboard },
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            try {
              await fetch(OPS_ALERT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  source: 'backend.webhook-registration',
                  severity: 'error',
                  message: 'Telegram sendMessage equipo nuevo falló',
                  details: `chat=${chatId} http=${res.status} body=${body.slice(0, 400)}`,
                }),
              });
            } catch {
              // ignore alert failures
            }
          }
        }));
      } catch (telegramError) {
        console.warn("Telegram direct send failed:", telegramError);
        try {
          await fetch(OPS_ALERT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'backend.webhook-registration',
              severity: 'error',
              message: 'Telegram direct send excepción (equipo nuevo)',
              details: telegramError instanceof Error ? telegramError.message : String(telegramError),
            }),
          });
        } catch {
          // ignore alert failures
        }
      }
    }

    // n8n: solo informativo a chat read-only (sin botones), sin duplicar al chat de admins.
    const n8nWebhookUrl = Deno.env.get('N8N_WH_URL');
    if (n8nWebhookUrl && hasChatIds(TELEGRAM_VIEWER_CHAT_IDS)) {
      try {
        await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: "team-registration",
            managerName,
            managerEmail,
            managerPhone,
            teamsCount: teams.length,
            teamSummaryLines,
            adminChatIds: TELEGRAM_VIEWER_CHAT_IDS,
            telegramButtons: [],
            message: `NUEVA INSCRIPCION (SOLO LECTURA)\n\nResponsable: ${managerName}\nCorreo: ${managerEmail}\nTelefono: ${managerPhone}\nEquipos: ${teams.length}\n\nResumen:\n${teamSummaryLines.map((line) => `- ${line}`).join("\n")}`,
          }),
        });
        console.log('n8n viewer webhook sent from webhook-registration');
      } catch (n8nError) {
        console.warn('n8n webhook failed (ignored):', n8nError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      managerEmail: managerResult, 
      adminEmail: adminResult 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in webhook-registration:', error);
    try {
      await fetch(OPS_ALERT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'backend.webhook-registration',
          severity: 'critical',
          message: 'Error in webhook-registration',
          details: error instanceof Error ? error.message : String(error),
        }),
      });
    } catch {
      // ignore alert failures
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
