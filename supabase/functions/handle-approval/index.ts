import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const { record, old_record } = await req.json();

    // Trigger only when status changes to 'approved'
    if (record.status !== 'approved' || old_record?.status === 'approved') {
      return new Response(JSON.stringify({ message: 'No action required' }), { status: 200 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Find the existing Auth User (created during registration)
    const { data: users, error: findError } = await supabaseAdmin.auth.admin.listUsers();
    if (findError) throw findError;

    const authUser = users.users.find(u => u.email === record.manager_email);
    const userId = authUser?.id;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User not found in Auth' }), { status: 404 });
    }

    // 2. Confirm email and set role in metadata (just in case)
    await supabaseAdmin.auth.admin.updateUserById(userId, { 
      email_confirm: true,
      user_metadata: { role: 'manager' }
    });

    // 3. Ensure profile entry exists with correct role
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email: record.manager_email,
      role: 'manager',
      full_name: record.manager_name
    });

    // 4. Generate Magic Link (Invite/Login Link)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: record.manager_email,
      options: { redirectTo: 'https://torneomuskiz.com/manager-login' }
    });

    if (linkError) throw linkError;

    const magicLink = linkData.properties.action_link;

    // 5. Send Welcome Email via Resend
    // We DON'T send a new password, we tell them to use the one they chose.
    const emailBody = {
      from: 'onboarding@resend.dev',
      to: record.manager_email,
      subject: "¡Inscripción Aprobada! - Acceso al Panel de Manager",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #0df2f2;">¡Hola, ${record.manager_name}!</h2>
          <p>Tenemos el placer de informarte que el equipo <strong>${record.name}</strong> ha sido oficialmente aprobado para el II Torneo Muskiz.</p>
          
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0df2f2;">
            <p style="margin: 0; font-weight: bold;">Datos de acceso:</p>
            <p style="margin: 5px 0;"><strong>Usuario:</strong> ${record.manager_email}</p>
            <p style="margin: 5px 0; color: #666; font-size: 0.85em;">* Utiliza la contraseña que elegiste durante el registro.</p>
          </div>

          <p>Puedes acceder directamente usando el siguiente enlace (sin necesidad de contraseña esta vez):</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" style="background: #0df2f2; color: #111; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">ACCEDER AL PANEL</a>
          </div>

          <p style="color: #666; font-size: 0.9em;">
            Una vez dentro, podrás gestionar tu plantilla, ver los horarios y subir la documentación necesaria.
          </p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="text-align: center; color: #999; font-size: 0.8em;">II Torneo Balonmano Playa Muskiz</p>
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
    return new Response(JSON.stringify(resData), { 
      headers: { 'Content-Type': 'application/json' },
      status: res.status 
    });

  } catch (error) {
    console.error('Error in handle-approval:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
