import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_EMAIL = "admin@torneomuskizbmplaya.es";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { teamName, managerName, managerEmail, division } = await req.json();

    if (!managerEmail || !teamName) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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

    const magicLink = linkData?.properties?.action_link || 'https://torneomuskizbmplaya.es/manager-login';

    // 5. Send approval email with credentials
    const emailBody = {
      from: `Torneo Muskiz <${FROM_EMAIL}>`,
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
            
            <!-- Next Steps -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <h4 style="margin: 0 0 8px; color: #334155; font-size: 13px;">📋 Próximos Pasos:</h4>
              <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.8;">
                <li>Accede al panel de responsable con tus credenciales</li>
                <li>Añade los jugadores de tu equipo (nombre, dorsal, posición)</li>
                <li>Sube la documentación de cada jugador (DNI y seguro deportivo)</li>
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailBody),
    });

    const resData = await res.json();

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
