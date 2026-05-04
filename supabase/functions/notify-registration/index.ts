import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";
const FROM_EMAIL = "admin@torneomuskizbmplaya.es";

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
      from: `Torneo Muskiz <${FROM_EMAIL}>`,
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
    const teamSummaryForAdmin = teams.map((t: { name: string; division: string }) =>
      `<strong>${t.name}</strong> (${t.division})`
    ).join(', ');

    const adminEmailBody = {
      from: `Torneo Muskiz <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `🚨 NUEVA INSCRIPCIÓN: ${managerName} — ${teams.length} equipo(s)`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
          <h2 style="color: #dc2626;">🚨 Nueva Inscripción Recibida</h2>
          <p style="color: #475569; font-size: 14px;">Se ha registrado una nueva inscripción que requiere tu validación:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Responsable</td>
              <td style="padding: 10px; color: #1e293b;">${managerName} (${managerEmail})</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Equipos</td>
              <td style="padding: 10px; color: #1e293b;">${teamSummaryForAdmin}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Importe Total</td>
              <td style="padding: 10px; color: #1e293b; font-weight: bold;">${totalFee}€</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold; color: #64748b; font-size: 13px;">Método</td>
              <td style="padding: 10px; color: #1e293b;">Transferencia Bancaria</td>
            </tr>
          </table>
          
          <div style="text-align: center; margin: 28px 0;">
            <a href="https://torneomuskizbmplaya.es/admin" style="background: #111827; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
              IR AL PANEL DE CONTROL →
            </a>
          </div>
        </div>
      `,
    };

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
