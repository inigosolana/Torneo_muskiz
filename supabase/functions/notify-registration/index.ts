import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = "torneomuskizbmplaya@gmail.com";

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();
    const { manager_email, manager_name, payment_method, name, division, city } = record;

    if (!manager_email) {
      return new Response(JSON.stringify({ error: 'No manager email found' }), { status: 400 });
    }

    // --- 1. EMAIL TO MANAGER ---
    const managerMessage = payment_method === 'CARD' 
      ? "Tu pago ha sido recibido correctamente y tu inscripción está pendiente de validación final por parte del administrador."
      : "Hemos recibido tu solicitud de inscripción. Tu plaza quedará reservada una vez confirmemos el ingreso de la transferencia y validemos tu registro.";

    const managerEmailBody = {
      from: 'onboarding@resend.dev',
      to: manager_email,
      subject: `Inscripción Recibida: ${name} - II Torneo Muskiz`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #0df2f2;">¡Hola ${manager_name}!</h2>
          <p>Has registrado correctamente al equipo <strong>${name}</strong> en el II Torneo Muskiz.</p>
          <p>${managerMessage}</p>
          <div style="background: #fff8e1; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 0.9em;"><strong>Estado:</strong> Pendiente de validación.</p>
            <p style="margin: 5px 0 0 0; font-size: 0.8em;">El administrador revisará tu registro en un periodo máximo de 24 horas. Recibirás otro email con tus credenciales una vez seas aprobado.</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="text-align: center; color: #999; font-size: 0.8em;">II Torneo Balonmano Playa Muskiz</p>
        </div>
      `,
    };

    // --- 2. EMAIL TO ADMIN ---
    const adminEmailBody = {
      from: 'onboarding@resend.dev',
      to: ADMIN_EMAIL,
      subject: `🚨 NUEVA INSCRIPCIÓN: ${name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Nueva inscripción detectada</h2>
          <p>Se ha registrado un nuevo equipo que requiere validación:</p>
          <ul>
            <li><strong>Equipo:</strong> ${name}</li>
            <li><strong>Categoría:</strong> ${division}</li>
            <li><strong>Ciudad:</strong> ${city}</li>
            <li><strong>Responsable:</strong> ${manager_name} (${manager_email})</li>
            <li><strong>Método Pago:</strong> ${payment_method}</li>
          </ul>
          <p><a href="https://torneomuskiz.com/admin" style="background: #111; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">IR AL PANEL DE CONTROL</a></p>
        </div>
      `,
    };

    // Send both emails
    await Promise.all([
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

    return new Response(JSON.stringify({ success: true }), { 
      headers: { 'Content-Type': 'application/json' },
      status: 200 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
