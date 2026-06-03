import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FROM_EMAIL = "Torneo Muskiz <admin@torneomuskizbmplaya.es>";
const MANAGER_LOGIN_URL = "https://torneomuskizbmplaya.es/manager-login";
const LICENSE_LAST_DAY = "4 de junio de 2026";
const MIN_PLAYERS = 6;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isSeniorDivision(division: string): boolean {
  return division.toLowerCase().includes("senior");
}

async function fetchManagerLoginPassword(
  supabaseAdmin: ReturnType<typeof createClient>,
  managerEmail: string,
  registrationId?: string | null,
): Promise<string | null> {
  if (registrationId) {
    const { data } = await supabaseAdmin
      .from("registrations")
      .select("manager_login_password")
      .eq("id", registrationId)
      .maybeSingle();
    const pwd = String(data?.manager_login_password ?? "").trim();
    if (pwd) return pwd;
  }

  const { data: rows } = await supabaseAdmin
    .from("registrations")
    .select("manager_login_password")
    .ilike("manager_email", managerEmail)
    .not("manager_login_password", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const pwd = String(rows?.[0]?.manager_login_password ?? "").trim();
  return pwd || null;
}

function credentialsPasswordHtml(storedPassword: string | null): string {
  if (storedPassword) {
    return `<span style="font-family:monospace;font-weight:700;color:#0f172a;">${escHtml(storedPassword)}</span>`;
  }
  return `<span style="color:#334155;">No consta en el sistema (inscripción anterior). Usa «¿Has olvidado tu contraseña?» en el login o contacta con la organización.</span>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno requeridas." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.slice(7).trim();
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "staff") {
      return new Response(JSON.stringify({ error: "Solo administración puede enviar recordatorios." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { teamId } = await req.json();
    if (!teamId) {
      return new Response(JSON.stringify({ error: "Falta teamId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, name, division, manager_name, manager_email, status, registration_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr) throw teamErr;
    if (!team) {
      return new Response(JSON.stringify({ error: "Equipo no encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const managerEmail = String(team.manager_email ?? "").trim().toLowerCase();
    if (!managerEmail) {
      return new Response(JSON.stringify({ error: "El equipo no tiene email de responsable." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: players, error: playersErr } = await supabaseAdmin
      .from("players")
      .select("name, surnames, number, role, dni_status, insurance_status")
      .eq("team_id", teamId);

    if (playersErr) throw playersErr;

    const roster = (players ?? []).filter((p) => (p.role ?? "PLAYER") === "PLAYER");
    const playerCount = roster.length;
    const maxJugadores = isSeniorDivision(String(team.division ?? "")) ? 12 : 14;
    const maxConvocados = isSeniorDivision(String(team.division ?? "")) ? 10 : 12;

    const missingInsurance = roster.filter((p) => p.insurance_status !== "APPROVED");
    const missingDni = roster.filter((p) => p.dni_status !== "APPROVED");

    const issueLines: string[] = [];
    if (playerCount < MIN_PLAYERS) {
      issueLines.push(
        `<li><strong>Plantilla incompleta:</strong> tienes ${playerCount} jugador(es); el mínimo es <strong>${MIN_PLAYERS}</strong> (máx. ${maxJugadores} en ${escHtml(String(team.division ?? ""))}).</li>`,
      );
    }

    const insEmpty = missingInsurance.filter((p) => p.insurance_status === "EMPTY");
    const insPending = missingInsurance.filter((p) => p.insurance_status === "PENDING");
    const insRejected = missingInsurance.filter((p) => p.insurance_status === "REJECTED");

    if (insEmpty.length > 0) {
      const names = insEmpty
        .slice(0, 8)
        .map((p) => escHtml([p.name, p.surnames].filter(Boolean).join(" ").trim() || "Jugador"))
        .join(", ");
      issueLines.push(
        `<li><strong>Seguro obligatorio sin subir</strong> (${insEmpty.length}): ${names}${insEmpty.length > 8 ? "…" : ""}.</li>`,
      );
    }
    if (insPending.length > 0) {
      issueLines.push(
        `<li><strong>Seguro pendiente de validación</strong> por la organización (${insPending.length} jugador/es).</li>`,
      );
    }
    if (insRejected.length > 0) {
      issueLines.push(
        `<li><strong>Seguro rechazado</strong> — debes subir un archivo nuevo (${insRejected.length} jugador/es).</li>`,
      );
    }

    const dniEmpty = missingDni.filter((p) => p.dni_status === "EMPTY");
    if (dniEmpty.length > 0) {
      issueLines.push(`<li><strong>DNI sin subir</strong> (${dniEmpty.length} jugador/es).</li>`);
    }

    if (issueLines.length === 0) {
      return new Response(
        JSON.stringify({
          skipped: true,
          message: "La plantilla parece completa; no se envió correo.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const authUser = usersData.users.find((u: { email?: string }) =>
      String(u.email ?? "").toLowerCase() === managerEmail
    );

    let magicLink = MANAGER_LOGIN_URL;
    if (authUser) {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: managerEmail,
        options: { redirectTo: MANAGER_LOGIN_URL },
      });
      magicLink = linkData?.properties?.action_link ?? MANAGER_LOGIN_URL;
    }

    const managerName = escHtml(String(team.manager_name ?? "Responsable"));
    const teamName = escHtml(String(team.name ?? "Tu equipo"));
    const division = escHtml(String(team.division ?? ""));
    const storedPassword = await fetchManagerLoginPassword(
      supabaseAdmin,
      managerEmail,
      team.registration_id as string | null | undefined,
    );

    const html = `
<div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:620px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:28px 24px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">⏰</div>
    <h1 style="color:#fff;margin:0;font-size:20px;">Recordatorio: plantilla y seguros</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:13px;">${teamName} · ${division}</p>
  </div>
  <div style="padding:26px 24px;">
    <p style="color:#475569;line-height:1.6;font-size:14px;">Hola <strong>${managerName}</strong>,</p>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      Te recordamos que debes completar la <strong>plantilla</strong> del equipo <strong>${teamName}</strong> en el panel de responsables del torneo.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #d97706;border-radius:10px;padding:16px 18px;margin:18px 0;">
      <h3 style="margin:0 0 10px;color:#92400e;font-size:14px;">Pendiente en tu equipo</h3>
      <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.75;">${issueLines.join("")}</ul>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.65;">
        <strong>El seguro es OBLIGATORIO</strong> para cada jugador/a: puedes subir <strong>ficha federativa</strong>,
        <strong>seguro deportivo</strong> o <strong>seguro privado</strong> válido. Sin seguro aprobado no podrá competir.
      </p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin:16px 0;">
      <h3 style="margin:0 0 10px;color:#166534;font-size:14px;">🔑 Cómo entrar (responsable)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#15803d;font-weight:700;">Usuario</td>
          <td style="padding:4px 0;font-family:monospace;color:#0f172a;">${escHtml(managerEmail)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#15803d;font-weight:700;">Contraseña</td>
          <td style="padding:4px 0;">${credentialsPasswordHtml(storedPassword)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#15803d;font-weight:700;">Web</td>
          <td style="padding:4px 0;"><a href="${MANAGER_LOGIN_URL}" style="color:#0d9488;">${MANAGER_LOGIN_URL}</a></td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${magicLink}" style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;display:inline-block;">
        IR AL PANEL DE MI EQUIPO →
      </a>
    </div>
    <p style="color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
      Plazo: plantilla y licencias completas antes del <strong>${LICENSE_LAST_DAY}</strong>.
      Mín. ${MIN_PLAYERS} jugadores · convocatoria hasta ${maxConvocados} por partido.
    </p>
  </div>
  <div style="background:#f1f5f9;padding:14px 24px;text-align:center;">
    <p style="color:#94a3b8;font-size:11px;margin:0;">© 2026 II Torneo Balonmano Playa Muskiz</p>
  </div>
</div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: managerEmail,
        subject: `⏰ Recordatorio plantilla y seguro — ${team.name} — Torneo Muskiz`,
        html,
      }),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error("[remind-manager-squad] Resend error", res.status, resData);
      return new Response(JSON.stringify({ error: "Error enviando el correo.", details: resData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, email: managerEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[remind-manager-squad]", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
