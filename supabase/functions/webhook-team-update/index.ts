import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

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
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Faltan variables de entorno requeridas.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    console.log('Webhook payload received:', payload);

    const { record, old_record, type } = payload;

    if (type !== 'UPDATE') {
      return new Response(JSON.stringify({ message: 'Not an update. Skipping.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // --- CASE 1: APPROVAL ---
    if (record.status === 'approved' && old_record.status !== 'approved') {
      console.log('Detected team approval:', record.name);

      const managerEmail = record.manager_email;
      const managerName = record.manager_name;
      const teamName = record.name;
      const division = record.division;
      const divisionStr = String(division ?? '');
      const isSeniorCategory = divisionStr.toLowerCase().includes('senior');
      const maxJugadores = isSeniorCategory ? 12 : 14;

      // 1. Find the Auth user created during registration
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      const authUser = usersData.users.find((u: any) => u.email === managerEmail);
      
      if (!authUser) {
        console.error('User not found in Auth for email:', managerEmail);
        // We still send the email but skip the auth confirmation part
      } else {
        // 2. Confirm email and activate the manager role
        await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
          email_confirm: true,
          user_metadata: { role: 'manager', approved: true }
        });

        // 3. Ensure profile exists with 'manager' role
        await supabaseAdmin.from('profiles').upsert({
          id: authUser.id,
          email: managerEmail,
          role: 'manager',
          full_name: managerName
        });
      }

      // 4. Generate a magic link for instant access (even if user wasn't found, we can try to generate one or just link to login)
      let magicLink = 'https://torneomuskizbmplaya.es/manager-login';
      if (authUser) {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: managerEmail,
          options: { redirectTo: 'https://torneomuskizbmplaya.es/manager-login' }
        });
        if (linkData?.properties?.action_link) {
          magicLink = linkData.properties.action_link;
        }
      }

      // 5. Send approval email
      const emailBody = {
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

              <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 10px; padding: 16px 18px; margin: 20px 0;">
                <h4 style="margin: 0 0 8px; color: #92400e; font-size: 14px;">📅 Plazo para la plantilla</h4>
                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.65;">
                  El <strong>último día para tener subidos todos los jugadores en el sistema es el 2 de junio de 2026</strong>.
                  <strong>No se harán excepciones</strong> pasada esa fecha: no se admitirán altas ni cambios de plantilla fuera de lo que marque la organización.
                </p>
              </div>

              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 18px; margin: 16px 0;">
                <h4 style="margin: 0 0 10px; color: #1e40af; font-size: 14px;">👥 Cupo de jugadores en pista</h4>
                <ul style="margin: 0; padding-left: 18px; color: #1e3a8a; font-size: 13px; line-height: 1.75;">
                  <li><strong>Mínimo 6 jugadores</strong> en la plantilla.</li>
                  <li><strong>Máximo de jugadores según categoría:</strong> en <strong>Senior</strong> (masculino y femenino) hasta <strong>12</strong>; en el <strong>resto de categorías</strong> hasta <strong>14</strong>.</li>
                  <li>Tu equipo está inscrito en <strong>${divisionStr || 'N/D'}</strong> → el cupo que te aplica es de <strong>hasta ${maxJugadores} jugadores</strong>.</li>
                </ul>
              </div>

              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 18px; margin: 16px 0;">
                <h4 style="margin: 0 0 10px; color: #166534; font-size: 14px;">🛡️ Entrenador y oficiales de mesa</h4>
                <p style="margin: 0; color: #14532d; font-size: 13px; line-height: 1.75;">
                  Además de los jugadores, en el mismo panel debes dar de alta:
                  <strong>1 entrenador/a</strong> (rol Entrenador) y <strong>2 oficiales de mesa</strong> (rol Oficial).
                  Estas <strong>3 personas no cuentan</strong> dentro del cupo máximo de jugadores indicado arriba.
                </p>
              </div>
              
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

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify(emailBody),
      });

      return new Response(JSON.stringify({ success: true, action: 'approval', emailResult: await res.json() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- CASE 2: REJECTION ---
    else if (record.status === 'rejected' && old_record.status !== 'rejected') {
      console.log('Detected team rejection:', record.name);

      const managerEmail = record.manager_email;
      const managerName = record.manager_name;
      const teamName = record.name;
      const division = record.division;
      const rejectionReason = record.payment_feedback || 'No se ha especificado un motivo.';

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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify(emailBody),
      });

      return new Response(JSON.stringify({ success: true, action: 'rejection', emailResult: await res.json() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'No action needed.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in webhook-team-update:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
