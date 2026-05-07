import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";
const INTERNAL_SECRET = Deno.env.get("PLAYER_DOC_NOTIFY_INTERNAL_SECRET");

const DEFAULT_REJECT_REASON =
  Deno.env.get("PLAYER_DOC_REJECTION_DEFAULT_REASON") ??
  "El organizador no ha podido validar el documento (legibilidad, archivo incorrecto o documento no vigente). Sube un archivo nuevo desde el panel de tu equipo. Si necesitas ayuda, contacta con la organización del torneo.";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-player-doc-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE || !RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing configuration" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const internalHeader = req.headers.get("x-player-doc-notify-secret");
    let authorized = Boolean(INTERNAL_SECRET && internalHeader === INTERNAL_SECRET);

    if (!authorized) {
      const auth = req.headers.get("Authorization");
      if (auth?.startsWith("Bearer ")) {
        const jwt = auth.slice(7);
        // Otras Edge Functions del mismo proyecto (p. ej. admin-review-action) llaman con service role.
        if (SERVICE_ROLE && jwt === SERVICE_ROLE) {
          authorized = true;
        } else {
          const { data: { user }, error: uErr } = await supabase.auth.getUser(jwt);
          if (!uErr && user) {
            const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
            if (profile?.role === "staff") authorized = true;
          }
        }
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const playerId = String(body.playerId ?? "");
    const docTypeRaw = String(body.docType ?? "");
    const docType = docTypeRaw === "insurance" ? "insurance" : docTypeRaw === "dni" ? "dni" : "";
    const approved = Boolean(body.approved);
    const reasonRaw = body.rejectionReason;
    let rejectionReason = reasonRaw != null && String(reasonRaw).trim().length > 0
      ? String(reasonRaw).trim().slice(0, 4000)
      : "";

    if (!playerId || !docType) {
      return new Response(JSON.stringify({ error: "playerId and docType (dni|insurance) required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("name, surnames, team_id")
      .eq("id", playerId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: team, error: tErr } = await supabase
      .from("teams")
      .select("name, manager_name, manager_email")
      .eq("id", player.team_id)
      .maybeSingle();
    if (tErr) throw tErr;

    const managerEmail = team?.manager_email?.trim();
    if (!managerEmail) {
      return new Response(JSON.stringify({ error: "Team has no manager email" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const docLabel = docType === "dni" ? "DNI / identificación" : "Seguro médico o federativo";
    const playerName = [player.name, player.surnames].filter(Boolean).join(" ").trim() || "Jugador";
    const teamName = team?.name ?? "Tu equipo";
    const managerName = team?.manager_name ?? "Responsable";

    if (!approved && !rejectionReason) {
      rejectionReason = DEFAULT_REJECT_REASON;
    }

    const subject = approved
      ? `✅ ${docLabel} aprobado — ${playerName} (${teamName})`
      : `❌ ${docLabel} no aprobado — ${playerName} (${teamName})`;

    const html = approved
      ? `
<div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:22px;line-height:1.55;color:#0f172a;">
  <h2 style="margin:0 0 12px;color:#15803d;">Documento aprobado</h2>
  <p>Hola ${escHtml(managerName)},</p>
  <p>El organizador ha <strong>aprobado</strong> el documento de <strong>${escHtml(docLabel)}</strong> del jugador/a <strong>${escHtml(playerName)}</strong> del equipo <strong>${escHtml(teamName)}</strong>.</p>
  <p style="color:#64748b;font-size:14px;">Puedes revisar la ficha en tu panel de responsable cuando quieras.</p>
  <p style="margin-top:20px;font-size:13px;color:#64748b;">— Torneo Muskiz</p>
</div>`
      : `
<div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:22px;line-height:1.55;color:#0f172a;">
  <h2 style="margin:0 0 12px;color:#b91c1c;">Documento no aprobado</h2>
  <p>Hola ${escHtml(managerName)},</p>
  <p>El organizador <strong>no ha aprobado</strong> el documento de <strong>${escHtml(docLabel)}</strong> del jugador/a <strong>${escHtml(playerName)}</strong> del equipo <strong>${escHtml(teamName)}</strong>.</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;margin:16px 0;">
    <p style="margin:0;font-size:14px;"><strong>Motivo / indicaciones para el responsable:</strong></p>
    <p style="margin:8px 0 0;white-space:pre-wrap;">${escHtml(rejectionReason)}</p>
  </div>
  <p>Sube un archivo nuevo desde tu panel de equipo cuando lo tengas corregido.</p>
  <p style="margin-top:20px;font-size:13px;color:#64748b;">— Torneo Muskiz</p>
</div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: managerEmail,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const t = await resendRes.text();
      throw new Error(`Resend ${resendRes.status}: ${t}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
