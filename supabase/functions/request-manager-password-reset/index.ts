import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";
const DEFAULT_SITE_URL = "https://torneomuskizbmplaya.es";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function siteUrl(): string {
  const fromEnv = Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL");
  return (fromEnv ?? DEFAULT_SITE_URL).replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Configuración del servidor incompleta. Contacta con la organización." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { email } = await req.json();
    const managerEmail = String(email ?? "").trim().toLowerCase();
    if (!managerEmail) {
      return new Response(JSON.stringify({ error: "Introduce tu correo electrónico." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id, status")
      .eq("manager_email", managerEmail)
      .neq("status", "rejected")
      .limit(1);

    if (teamsError) throw teamsError;

    if (!teams || teams.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "No hay ninguna inscripción con ese correo. Si aún no te has inscrito, hazlo en la web. Si el correo es correcto y sigue fallando, escribe a torneomuskizbmplaya@gmail.com",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const redirectTo = `${siteUrl()}/manager-login`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: managerEmail,
      options: { redirectTo },
    });

    if (linkError) {
      const msg = linkError.message ?? "";
      if (/not found|no user|does not exist/i.test(msg)) {
        return new Response(
          JSON.stringify({
            error:
              "No existe cuenta con ese correo. Usa el mismo email con el que te inscribiste. Si acabas de inscribirte, espera el correo de aprobación o contacta con la organización.",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw linkError;
    }

    const recoveryLink = linkData?.properties?.action_link;
    if (!recoveryLink) {
      throw new Error("No se pudo generar el enlace de recuperación.");
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: managerEmail,
        subject: "🔐 Recuperación de contraseña - Torneo Muskiz",
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <h2 style="margin:0 0 10px;color:#0f172a;">Recuperar contraseña</h2>
            <p style="margin:0 0 12px;color:#475569;">Hemos recibido una solicitud para restablecer tu contraseña del panel de responsables.</p>
            <p style="margin:0 0 16px;color:#475569;">Pulsa en el siguiente botón (válido un tiempo limitado):</p>
            <a href="${recoveryLink}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">Restablecer contraseña</a>
            <p style="margin:16px 0 8px;color:#64748b;font-size:12px;">Si el botón no funciona, copia este enlace en el navegador:<br/><a href="${recoveryLink}" style="color:#0d9488;word-break:break-all;">${recoveryLink}</a></p>
            <p style="margin:0;color:#94a3b8;font-size:12px;">Si no solicitaste este cambio, ignora este mensaje.</p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const resendBody = await resendRes.text();
      console.error("Resend error:", resendBody);
      throw new Error("No se pudo enviar el correo. Inténtalo más tarde o contacta con la organización.");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("request-manager-password-reset:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error inesperado al solicitar recuperación.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
