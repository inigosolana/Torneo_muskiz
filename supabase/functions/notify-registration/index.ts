import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();
    const { manager_email, manager_name, payment_method, name } = record;

    if (!manager_email) {
      return new Response(JSON.stringify({ error: 'No manager email found' }), { status: 400 });
    }

    const subject = `Inscripción recibida: ${name} - II Torneo Muskiz`;
    let message = "";

    if (payment_method === 'CARD') {
      message = "Tu pago ha sido recibido correctamente a través de la plataforma y tu inscripción está pendiente de validación final por parte del administrador.";
    } else {
      message = "Hemos recibido tu solicitud de inscripción por transferencia bancaria. Tu plaza quedará reservada una vez confirmemos el ingreso y el administrador valide la documentación.";
    }

    const emailBody = {
      from: 'onboarding@resend.dev',
      to: manager_email,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #0df2f2;">¡Hola ${manager_name}!</h2>
          <p>Gracias por registrar al equipo <strong>${name}</strong> en el II Torneo Muskiz.</p>
          <p>${message}</p>
          <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
            Recuerda que puedes gestionar tu plantilla y subir la documentación necesaria en el panel de manager una vez que tu equipo sea aprobado.
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

    const data = await res.json();
    return new Response(JSON.stringify(data), { 
      headers: { 'Content-Type': 'application/json' },
      status: res.status 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
