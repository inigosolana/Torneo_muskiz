import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";
const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "https://torneomuskizbmplaya.es").replace(
  /\/$/,
  "",
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Configuración incompleta." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData.user?.email) {
      return new Response(JSON.stringify({ error: "Sesión no válida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const managerEmail = userData.user.email.trim().toLowerCase();

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("manager_email", managerEmail)
      .neq("status", "rejected")
      .limit(1);

    if (teamsError) throw teamsError;
    if (!teams?.length) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const loginUrl = `${SITE_URL}/manager-login`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: managerEmail,
        subject: "✅ Contraseña actualizada - Torneo Muskiz",
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <h2 style="margin:0 0 10px;color:#0f172a;">Contraseña cambiada correctamente</h2>
            <p style="margin:0 0 12px;color:#475569;">Tu contraseña del panel de responsables del Torneo Muskiz se ha actualizado correctamente.</p>
            <p style="margin:0 0 16px;color:#475569;">Ya puedes entrar con tu nueva contraseña:</p>
            <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">Ir al inicio de sesión</a>
            <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">Si no fuiste tú, contacta con torneomuskizbmplaya@gmail.com de inmediato.</p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const body = await resendRes.text();
      console.error("Resend error:", body);
      throw new Error("No se pudo enviar el correo de confirmación.");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-manager-password-changed:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error inesperado.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
