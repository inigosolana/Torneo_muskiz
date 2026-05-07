import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log("[notify-registration] Request received");

    if (!RESEND_API_KEY) {
      console.error("[notify-registration] Missing RESEND_API_KEY environment variable");
      return new Response(JSON.stringify({ error: "Falta configuración de correo (RESEND_API_KEY)." }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { teams, managerName, managerEmail } = await req.json();

    if (!managerEmail || !teams || teams.length === 0) {
      return new Response(JSON.stringify({ error: 'Faltan datos: email del responsable o equipos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build dynamic team list HTML
    const teamListHtml = teams.map((t: { name: string; division: string; city: string; fee: number }) =>
      `<li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <strong>${t.name}</strong> <span style="color: #666;">(${t.city})</span>
        <br><span style="font-size: 0.85em; color: #0d9488;">📋 ${t.division} — ${t.fee}€</span>
      </li>`
    ).join('');

    const totalFee = teams.reduce((sum: number, t: { fee: number }) => sum + t.fee, 0);

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

            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 20px;">
              <div style="background:#ecfeff; border:1px solid #a5f3fc; border-radius:10px; padding:10px 12px;">
                <p style="margin:0; color:#0e7490; font-size:11px; text-transform:uppercase; font-weight:700;">Equipos</p>
                <p style="margin:4px 0 0; color:#0f172a; font-size:18px; font-weight:700;">${teams.length}</p>
              </div>
              <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px 12px;">
                <p style="margin:0; color:#15803d; font-size:11px; text-transform:uppercase; font-weight:700;">Importe total</p>
                <p style="margin:4px 0 0; color:#0f172a; font-size:18px; font-weight:700;">${totalFee}€</p>
              </div>
            </div>
            
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
    const teamSummaryForAdmin = teams.map((t: { name: string; division: string }) =>
      `<strong>${t.name}</strong> (${t.division})`
    ).join(', ');

    const adminEmailBody = {
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🚨 NUEVA INSCRIPCIÓN: ${managerName} — ${teams.length} equipo(s)`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; background:#ffffff; border:1px solid #e2e8f0; border-radius: 16px; overflow:hidden;">
          <div style="background: linear-gradient(135deg, #dc2626, #f97316); padding: 24px;">
            <p style="margin:0; color:#fee2e2; font-size:12px; font-weight:600; letter-spacing:.5px; text-transform:uppercase;">Panel de administración</p>
            <h2 style="margin:6px 0 0; color:#ffffff; font-size:22px;">🚨 Nueva inscripción recibida</h2>
          </div>

          <div style="padding: 20px 24px;">
            <p style="margin:0 0 14px; color: #475569; font-size: 14px;">Se ha registrado una nueva inscripción que requiere validación:</p>

            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                <p style="margin:0; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:700;">Nº equipos</p>
                <p style="margin:4px 0 0; color:#0f172a; font-size:18px; font-weight:700;">${teams.length}</p>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                <p style="margin:0; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:700;">Importe</p>
                <p style="margin:4px 0 0; color:#0f172a; font-size:18px; font-weight:700;">${totalFee}€</p>
              </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin: 12px 0 20px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Responsable</td>
                <td style="padding: 10px; color: #1e293b;">${managerName} (${managerEmail})</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Equipos</td>
                <td style="padding: 10px; color: #1e293b;">${teamSummaryForAdmin}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Método</td>
                <td style="padding: 10px; color: #1e293b;">Transferencia Bancaria</td>
              </tr>
            </table>

            <div style="text-align: center;">
              <a href="https://torneomuskizbmplaya.es/admin" style="background: #111827; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
                IR AL PANEL DE CONTROL →
              </a>
            </div>
          </div>
        </div>
      `,
    };

    console.log(`[notify-registration] Sending emails in parallel. Manager: ${managerEmail}, Admin: ${ADMIN_EMAIL}, Teams: ${teams.length}`);

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
      console.error("[notify-registration] Resend error", {
        managerStatus: managerRes.status,
        managerResult,
        adminStatus: adminRes.status,
        adminResult,
      });

      return new Response(JSON.stringify({
        error: "Error enviando correos con Resend.",
        managerStatus: managerRes.status,
        adminStatus: adminRes.status,
        managerResult,
        adminResult,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("[notify-registration] Emails sent successfully");

    const n8nWebhookUrl = Deno.env.get('N8N_WH_URL');
    if (n8nWebhookUrl) {
      try {
        console.log("[notify-registration] Triggering n8n WhatsApp webhook");
        const n8nRes = await fetch(n8nWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            managerName,
            teamsCount: teams.length,
            message: "¡Nueva inscripción recibida!",
          }),
        });

        if (!n8nRes.ok) {
          const n8nBody = await n8nRes.text();
          console.warn("[notify-registration] n8n webhook responded with non-2xx", {
            status: n8nRes.status,
            body: n8nBody,
          });
        } else {
          console.log("[notify-registration] n8n webhook delivered successfully");
        }
      } catch (n8nError) {
        // n8n failures must not fail registration notifications.
        console.warn("[notify-registration] n8n webhook failed (ignored)", n8nError);
      }
    } else {
      console.warn("[notify-registration] N8N_WH_URL not configured, skipping WhatsApp webhook");
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
    console.error('Error in notify-registration:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
