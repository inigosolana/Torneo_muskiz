import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const N8N_WH_URL = Deno.env.get("N8N_WH_URL");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");

const encoder = new TextEncoder();
const ADMIN_PANEL_URL = "https://torneomuskizbmplaya.es/admin";

const html = (title: string, message: string, ok = true) => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="font-family:Segoe UI,Tahoma,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:620px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 8px;color:${ok ? "#15803d" : "#b91c1c"};font-size:22px;">${title}</h1>
      <p style="margin:0;color:#334155;line-height:1.5;">${message}</p>
      <div style="margin-top:16px;">
        <a href="${ADMIN_PANEL_URL}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:13px;">Abrir panel admin</a>
      </div>
    </div>
  </body>
</html>`;

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(REVIEW_ACTION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getCategoryCapacitySummary(supabase: ReturnType<typeof createClient>) {
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("name, max_teams")
    .order("name", { ascending: true });
  if (categoriesError) throw categoriesError;

  const { data: occupiedTeams, error: teamsError } = await supabase
    .from("teams")
    .select("division")
    .in("status", ["pending", "approved"]);
  if (teamsError) throw teamsError;

  const approvedByDivision = new Map<string, number>();
  for (const row of occupiedTeams ?? []) {
    const division = row.division ?? "Sin categoria";
    approvedByDivision.set(division, (approvedByDivision.get(division) ?? 0) + 1);
  }

  return (categories ?? []).map((category) => {
    const maxTeams = Number(category.max_teams ?? 0);
    const used = approvedByDivision.get(category.name) ?? 0;
    const remaining = Math.max(maxTeams - used, 0);
    return {
      category: category.name,
      maxTeams,
      used,
      remaining,
    };
  });
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVIEW_ACTION_SECRET) {
    return new Response(html("Configuración incompleta", "Faltan variables de entorno para ejecutar esta acción.", false), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action");
  const docType = url.searchParams.get("docType");
  const exp = url.searchParams.get("exp");
  const token = url.searchParams.get("token");

  if (!entity || !id || !action || !exp || !token) {
    return new Response(html("Solicitud inválida", "Faltan parámetros obligatorios en el enlace.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return new Response(html("Enlace caducado", "La acción ya no está disponible, solicita un enlace nuevo.", false), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const payload = [entity, id, action, docType ?? "", exp].join("|");
  const expected = await sign(payload);
  if (expected !== token) {
    return new Response(html("Token inválido", "No se ha podido verificar la firma del enlace.", false), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (entity === "team") {
      if (action !== "approve" && action !== "reject") {
        throw new Error("Acción de equipo no soportada.");
      }

      const { data: currentTeam, error: teamLookupError } = await supabase
        .from("teams")
        .select("id, name, division, manager_name, manager_phone, registration_id")
        .eq("id", id)
        .single();
      if (teamLookupError) throw teamLookupError;
      if (!currentTeam) {
        throw new Error(`No se encontro el equipo para actualizar (${id}).`);
      }

      if (action === "reject") {
        // Rechazado => pierde la plaza y debe volver a rellenar desde cero.
        // Eliminamos jugadores + equipo y, si procede, la cabecera de registro.
        const { error: playersDeleteError } = await supabase
          .from("players")
          .delete()
          .eq("team_id", id);
        if (playersDeleteError) throw playersDeleteError;

        const { error: teamDeleteError } = await supabase
          .from("teams")
          .delete()
          .eq("id", id);
        if (teamDeleteError) throw teamDeleteError;

        if (currentTeam.registration_id) {
          const { data: siblingTeams, error: siblingsError } = await supabase
            .from("teams")
            .select("id")
            .eq("registration_id", currentTeam.registration_id)
            .limit(1);
          if (siblingsError) throw siblingsError;

          if (!siblingTeams || siblingTeams.length === 0) {
            const { error: registrationDeleteError } = await supabase
              .from("registrations")
              .delete()
              .eq("id", currentTeam.registration_id);
            if (registrationDeleteError) throw registrationDeleteError;
          }
        }
      } else {
        const { data: updatedRows, error } = await supabase
          .from("teams")
          .update({
            status: "approved",
            payment_feedback: null,
          })
          .select("id")
          .eq("id", id);
        if (error) throw error;
        if (!updatedRows || updatedRows.length === 0) {
          throw new Error(`No se encontro el equipo para actualizar (${id}).`);
        }
      }

      if (action === "approve" && N8N_WH_URL) {
        const capacity = await getCategoryCapacitySummary(supabase);
        const updatedTeam = currentTeam;
        const capacityLines = capacity.map((c) => `${c.category}: ${c.remaining}/${c.maxTeams} plazas libres`);
        const message = [
          "INSCRIPCION APROBADA",
          "",
          `Equipo: ${updatedTeam.name ?? "N/D"}`,
          `Categoria: ${updatedTeam.division ?? "N/D"}`,
          `Responsable: ${updatedTeam.manager_name ?? "N/D"}`,
          "",
          "PLAZAS DISPONIBLES POR CATEGORIA (pendientes + aprobadas ocupan plaza):",
          ...capacityLines,
        ].join("\n");

        try {
          await fetch(N8N_WH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventType: "team-approved",
              adminChatIds: TELEGRAM_ADMIN_CHAT_IDS,
              message,
            }),
          });
        } catch (notifyError) {
          console.warn("No se pudo enviar resumen de plazas a Telegram:", notifyError);
        }
      }

      return new Response(
        html(
          action === "approve" ? "Equipo aprobado" : "Equipo rechazado",
          action === "approve"
            ? `La revisión del equipo se ha guardado correctamente (${id}).`
            : `Equipo rechazado y eliminado (${id}). Para inscribirse, deberá rellenar de nuevo el formulario.`,
          true,
        ),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    if (entity === "player-doc") {
      if (!docType || (docType !== "dni" && docType !== "insurance")) {
        throw new Error("Tipo de documento inválido.");
      }
      if (action !== "approve" && action !== "reject") {
        throw new Error("Acción de documento no soportada.");
      }

      const field = docType === "dni" ? "dni_status" : "insurance_status";
      const { data, error } = await supabase
        .from("players")
        .update({ [field]: action === "approve" ? "APPROVED" : "REJECTED" })
        .select("id")
        .eq("id", id);

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(`No se encontro el jugador para actualizar (${id}).`);
      }

      const label = docType === "dni" ? "DNI" : "seguro";
      return new Response(
        html(
          action === "approve" ? `${label} aprobado` : `${label} rechazado`,
          `La revisión del documento del jugador se ha guardado correctamente (${id}).`,
          true,
        ),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response(html("Entidad inválida", "El enlace no apunta a una revisión reconocida.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return new Response(
      html("Error al procesar acción", error instanceof Error ? error.message : String(error), false),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
});
