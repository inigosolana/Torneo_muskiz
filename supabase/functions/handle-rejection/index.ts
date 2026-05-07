import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[handle-rejection] Request received');

    if (!RESEND_API_KEY) {
      console.error('[handle-rejection] Missing RESEND_API_KEY environment variable');
      return new Response(JSON.stringify({ error: 'Falta configuración de correo (RESEND_API_KEY).' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { teamName, managerName, managerEmail, division, rejectionReason } = await req.json();

    if (!managerEmail || !teamName || !rejectionReason) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos (email, equipo, motivo).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailBody = {
      from: FROM_EMAIL,
      to: managerEmail,
      subject: `❌ Inscripción Declinada — ${teamName} — II Torneo Muskiz`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #dc2626, #ef4444); padding: 32px 24px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">❌</div>
            <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Inscripción Declinada</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">Se ha encontrado un problema con tu solicitud</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 28px 24px;">
            <h2 style="color: #1e293b; margin: 0 0 8px;">Hola, ${managerName}</h2>
            <p style="color: #475569; line-height: 1.6; font-size: 14px;">
              Lamentamos informarte de que la inscripción del equipo <strong>${teamName}</strong> (${division}) 
              ha sido <strong style="color: #dc2626;">declinada</strong> por el administrador del torneo.
            </p>
            
            <!-- Rejection Reason Box -->
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h3 style="margin: 0 0 8px; color: #991b1b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">📝 Motivo del Rechazo</h3>
              <p style="margin: 0; color: #7f1d1d; font-size: 15px; line-height: 1.6; font-style: italic;">
                "${rejectionReason}"
              </p>
            </div>
            
            <!-- What to do -->
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <h4 style="margin: 0 0 8px; color: #92400e; font-size: 13px;">🔄 ¿Qué puedo hacer?</h4>
              <p style="margin: 0; color: #a16207; font-size: 13px; line-height: 1.6;">
                Debes subsanar el error indicado en el motivo de rechazo y <strong>volver a realizar el proceso de inscripción</strong> 
                desde la web del torneo. Tu plaza anterior ha sido liberada.
              </p>
            </div>
            
            <!-- CTA -->
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://torneomuskizbmplaya.es/registration" style="background: linear-gradient(135deg, #1e293b, #334155); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                VOLVER A INSCRIBIRME →
              </a>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 24px 0 0;">
              Si crees que hay un error, contacta con la organización en torneomuskizbmplaya@gmail.com
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f1f5f9; padding: 16px 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">© 2026 II Torneo Balonmano Playa Muskiz · torneomuskizbmplaya.es</p>
          </div>
        </div>
      `,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailBody),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error('[handle-rejection] Resend error', { status: res.status, resData });
      return new Response(JSON.stringify({ error: 'Error enviando correo de rechazo.', details: resData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    console.log('[handle-rejection] Rejection email sent successfully', {
      managerEmail,
      teamName,
      hasReason: Boolean(rejectionReason),
    });

    return new Response(JSON.stringify({ success: true, email: resData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in handle-rejection:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
