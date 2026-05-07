import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";

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
      return new Response(JSON.stringify({ error: "Missing environment configuration." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    const managerEmail = String(email ?? "").trim().toLowerCase();
    if (!managerEmail) {
      return new Response(JSON.stringify({ error: "Email is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: approvedTeams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("manager_email", managerEmail)
      .eq("status", "approved")
      .limit(1);

    if (teamsError) throw teamsError;

    if (!approvedTeams || approvedTeams.length === 0) {
      return new Response(JSON.stringify({
        error: "Solo responsables con equipos aprobados pueden recuperar contraseña.",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectTo = `${new URL(req.url).origin}/manager-login`;
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: managerEmail,
      options: { redirectTo },
    });
    if (linkError) throw linkError;

    const recoveryLink = linkData?.properties?.action_link;
    if (!recoveryLink) {
      throw new Error("Could not generate recovery link.");
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: managerEmail,
        subject: "🔐 Recuperación de contraseña - Torneo Muskiz",
        html: `
          <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <h2 style="margin:0 0 10px;color:#0f172a;">Recuperar contraseña</h2>
            <p style="margin:0 0 12px;color:#475569;">Hemos recibido una solicitud para restablecer tu contraseña.</p>
            <p style="margin:0 0 16px;color:#475569;">Pulsa en el siguiente botón para continuar:</p>
            <a href="${recoveryLink}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">Restablecer contraseña</a>
            <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">Si no solicitaste este cambio, ignora este mensaje.</p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const resendBody = await resendRes.text();
      throw new Error(`Resend error: ${resendBody}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
