import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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
    console.log('[handle-approval] Request received');

    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[handle-approval] Missing environment variables', {
        hasResend: Boolean(RESEND_API_KEY),
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });
      return new Response(JSON.stringify({ error: 'Faltan variables de entorno requeridas.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const bulkRegistrationApproval = payload.bulkRegistrationApproval === true;
    const bulkTeams = Array.isArray(payload.teams) ? payload.teams as Array<{ teamName?: string; division?: string }> : [];
    const { teamName, managerName, managerEmail, division } = payload;

    if (bulkRegistrationApproval && bulkTeams.length > 0) {
      if (!managerEmail || !managerName) {
        return new Response(JSON.stringify({ error: 'Faltan datos requeridos (inscripción conjunta).' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (!managerEmail || !teamName) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Find the Auth user created during registration
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const authUser = usersData.users.find((u: any) => u.email === managerEmail);
    
    if (!authUser) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado en Auth.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Confirm email and activate the manager role
    await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      email_confirm: true,
      user_metadata: { role: 'manager', approved: true }
    });

    // 3. Ensure profile exists with 'manager' role (gates login access)
    await supabaseAdmin.from('profiles').upsert({
      id: authUser.id,
      email: managerEmail,
      role: 'manager',
      full_name: managerName
    });

    // 4. Generate a magic link for instant access
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: managerEmail,
      options: { redirectTo: 'https://torneomuskizbmplaya.es/manager-login' }
    });
    if (linkError) {
      console.error('[handle-approval] Error generating magic link', linkError);
    }

    const magicLink = linkData?.properties?.action_link || 'https://torneomuskizbmplaya.es/manager-login';
    console.log('[handle-approval] Magic link prepared', { managerEmail, hasMagicLink: Boolean(linkData?.properties?.action_link) });

    function escAttr(s: string): string {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    }

    let emailBody: { from: string; to: string; subject: string; html: string };

    if (bulkRegistrationApproval && bulkTeams.length > 0) {
      const teamListHtml = bulkTeams.map((t) =>
        `<li><strong>${escAttr(String(t.teamName ?? "Equipo"))}</strong> (${escAttr(String(t.division ?? "N/D"))})</li>`
      ).join("");
      emailBody = {
        from: FROM_EMAIL,
        to: managerEmail,
        subject: `✅ ¡Inscripciones aprobadas! — ${bulkTeams.length} equipos — II Torneo Muskiz`,
        html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 32px 24px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">✅</div>
            <h1 style="color: #ffffff; margin: 0; font-size: 22px;">¡Inscripciones aprobadas!</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">${bulkTeams.length} equipos aceptados oficialmente</p>
          </div>
          <div style="padding: 28px 24px;">
            <h2 style="color: #1e293b; margin: 0 0 8px;">¡Enhorabuena, ${escAttr(String(managerName))}!</h2>
            <p style="color: #475569; line-height: 1.6; font-size: 14px;">
              Los siguientes equipos han sido aprobados para el <strong>II Torneo Balonmano Playa Muskiz</strong>:
            </p>
            <ul style="color:#334155; line-height:1.65;">${teamListHtml}</ul>
            <p style="color: #334155; line-height: 1.65; font-size: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 14px 0 0;">
              <strong>Importante:</strong> entra en la <strong>gestión de responsables</strong> y completa la plantilla de <strong>cada equipo</strong> (jugadores, DNI y seguro). El cupo máximo de jugadores en pista depende de la categoría de cada equipo (Senior: hasta 12; otras categorías: hasta 14).
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${magicLink}" style="background: linear-gradient(135deg, #059669, #10b981); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block;">
                ACCEDER AL PANEL →
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              Usuario (email): <strong>${escAttr(String(managerEmail))}</strong> · Contraseña: la que elegiste al registrarte · Plazo plantilla: <strong>2 de junio de 2026</strong>
            </p>
          </div>
          <div style="background: #f1f5f9; padding: 16px 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">© 2026 II Torneo Balonmano Playa Muskiz · torneomuskizbmplaya.es</p>
          </div>
        </div>
        `,
      };
    } else {
    const divisionStr = String(division ?? '');
    const isSeniorCategory = divisionStr.toLowerCase().includes('senior');
    const maxJugadores = isSeniorCategory ? 12 : 14;

    // 5. Send approval email with credentials
    emailBody = {
      from: FROM_EMAIL,
      to: managerEmail,
      subject: `✅ ¡Inscripción Aprobada! — ${teamName} — II Torneo Muskiz`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 32px 24px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">✅</div>
            <h1 style="color: #ffffff; margin: 0; font-size: 22px;">¡Inscripción Aprobada!</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">Tu equipo ha sido aceptado oficialmente</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 28px 24px;">
            <h2 style="color: #1e293b; margin: 0 0 8px;">¡Enhorabuena, ${managerName}!</h2>
            <p style="color: #475569; line-height: 1.6; font-size: 14px;">
              El equipo <strong>${teamName}</strong> (${division}) ha sido oficialmente aprobado para el <strong>II Torneo Balonmano Playa Muskiz</strong>.
            </p>
            <p style="color: #334155; line-height: 1.65; font-size: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 14px 0 0;">
              <strong>Importante:</strong> debes entrar en la <strong>gestión de responsables</strong> (panel web del torneo, enlace más abajo) e <strong>ir completando la plantilla</strong>: datos de cada jugador/a y la subida de <strong>DNI</strong> y <strong>seguro</strong> cuando los tengas. No dejes todo para el último día.
            </p>

            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 20px;">
              <div style="background:#ecfdf5; border:1px solid #bbf7d0; border-radius:10px; padding:10px 12px;">
                <p style="margin:0; color:#15803d; font-size:11px; text-transform:uppercase; font-weight:700;">Estado</p>
                <p style="margin:4px 0 0; color:#0f172a; font-size:16px; font-weight:700;">Aprobado</p>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                <p style="margin:0; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:700;">Categoría</p>
                <p style="margin:4px 0 0; color:#0f172a; font-size:16px; font-weight:700;">${division}</p>
              </div>
            </div>
            
            <!-- Credentials Box -->
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #22c55e; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h3 style="margin: 0 0 12px; color: #166534; font-size: 14px;">🔑 Datos de Acceso al Panel de Responsable</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #4ade80; font-weight: bold; font-size: 12px; text-transform: uppercase;">Usuario (Email)</td>
                  <td style="padding: 6px 0; color: #1e293b; font-weight: bold; font-family: monospace; font-size: 14px;">${managerEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #4ade80; font-weight: bold; font-size: 12px; text-transform: uppercase;">Contraseña</td>
                  <td style="padding: 6px 0; color: #1e293b; font-style: italic; font-size: 13px;">La que elegiste durante el registro</td>
                </tr>
              </table>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 28px 0;">
              <a href="${magicLink}" style="background: linear-gradient(135deg, #059669, #10b981); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(16,185,129,0.3);">
                ACCEDER AL PANEL →
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              O usa tus credenciales directamente en: <a href="https://torneomuskizbmplaya.es/manager-login" style="color: #0d9488;">torneomuskizbmplaya.es/manager-login</a>
            </p>
            
            <!-- Plazo límite -->
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 10px; padding: 16px 18px; margin: 20px 0;">
              <h4 style="margin: 0 0 8px; color: #92400e; font-size: 14px;">📅 Plazo para la plantilla</h4>
              <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.65;">
                El <strong>último día para tener subidos todos los jugadores en el sistema es el 2 de junio de 2026</strong>.
                <strong>No se harán excepciones</strong> pasada esa fecha: no se admitirán altas ni cambios de plantilla fuera de lo que marque la organización.
              </p>
            </div>

            <!-- Cupos -->
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 18px; margin: 16px 0;">
              <h4 style="margin: 0 0 10px; color: #1e40af; font-size: 14px;">👥 Cupo de jugadores en pista</h4>
              <ul style="margin: 0; padding-left: 18px; color: #1e3a8a; font-size: 13px; line-height: 1.75;">
                <li><strong>Mínimo 6 jugadores</strong> en la plantilla.</li>
                <li><strong>Máximo de jugadores según categoría:</strong> en <strong>Senior</strong> (masculino y femenino) hasta <strong>12</strong>; en el <strong>resto de categorías</strong> hasta <strong>14</strong>.</li>
                <li>Tu equipo está inscrito en <strong>${divisionStr || 'N/D'}</strong> → el cupo que te aplica es de <strong>hasta ${maxJugadores} jugadores</strong>.</li>
              </ul>
            </div>

            <!-- Entrenador y oficiales -->
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 18px; margin: 16px 0;">
              <h4 style="margin: 0 0 10px; color: #166534; font-size: 14px;">🛡️ Entrenador y oficiales de mesa</h4>
              <p style="margin: 0; color: #14532d; font-size: 13px; line-height: 1.75;">
                Además de los jugadores, en el mismo panel debes dar de alta:
                <strong>1 entrenador/a</strong> (rol Entrenador) y <strong>2 oficiales de mesa</strong> (rol Oficial).
                Estas <strong>3 personas no cuentan</strong> dentro del cupo máximo de jugadores indicado arriba.
              </p>
            </div>

            <!-- Next Steps -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <h4 style="margin: 0 0 8px; color: #334155; font-size: 13px;">📋 Resumen de pasos en el panel de responsables</h4>
              <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.85;">
                <li>Entra en <strong>Gestión de responsables</strong> con el botón de arriba o en <a href="https://torneomuskizbmplaya.es/manager-login" style="color:#0d9488;">manager-login</a>.</li>
                <li>Completa la ficha del equipo y <strong>registra jugadores</strong> (nombre, dorsal, posición) poco a poco.</li>
                <li>Sube <strong>DNI y seguro</strong> de cada jugador y espera la validación del organizador.</li>
                <li>Añade <strong>1 entrenador</strong> y <strong>2 oficiales</strong> con sus roles; no ocupan plaza de jugador.</li>
                <li>Respeta el <strong>mínimo 6</strong> y el <strong>máximo ${maxJugadores}</strong> jugadores para tu categoría, y el plazo del <strong>2 de junio de 2026</strong>.</li>
              </ol>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f1f5f9; padding: 16px 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">© 2026 II Torneo Balonmano Playa Muskiz · torneomuskizbmplaya.es</p>
          </div>
        </div>
      `,
    };
    }

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
      console.error('[handle-approval] Resend error', { status: res.status, resData });
      return new Response(JSON.stringify({ error: 'Error enviando correo de aprobación.', details: resData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    console.log('[handle-approval] Approval email sent successfully', { managerEmail, teamName: teamName ?? `bulk:${bulkTeams.length}` });

    return new Response(JSON.stringify({ success: true, email: resData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in handle-approval:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
