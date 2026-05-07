import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVIEW_ACTION_SECRET = Deno.env.get("REVIEW_ACTION_SECRET");
const N8N_WH_URL = Deno.env.get("N8N_WH_URL");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
const OPS_ALERT_URL = `${SUPABASE_URL}/functions/v1/notify-ops-alert`;

const encoder = new TextEncoder();
const ADMIN_PANEL_URL = "https://torneomuskizbmplaya.es/admin";

function redirectToAdmin(title: string, message: string) {
  const redirectUrl = new URL(ADMIN_PANEL_URL);
  redirectUrl.searchParams.set("review_title", title);
  redirectUrl.searchParams.set("review_message", message);
  return Response.redirect(redirectUrl.toString(), 302);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as Record<string, unknown>;
    const message = maybe.message ?? maybe.error_description ?? maybe.error;
    if (typeof message === "string" && message.trim().length > 0) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

async function sendOpsAlert(severity: "info" | "warning" | "error" | "critical", message: string, details: string) {
  try {
    await fetch(OPS_ALERT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "backend.admin-review-action",
        severity,
        message,
        details,
      }),
    });
  } catch {
    // ignore alert failures
  }
}

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
    return redirectToAdmin("Configuración incompleta", "Faltan variables de entorno para ejecutar esta acción.");
  }

  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action");
  const docType = url.searchParams.get("docType");
  const exp = url.searchParams.get("exp");
  const token = url.searchParams.get("token");

  if (!entity || !id || !action || !exp || !token) {
    return redirectToAdmin("Solicitud inválida", "Faltan parámetros obligatorios en el enlace.");
  }

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return redirectToAdmin("Enlace caducado", "La acción ya no está disponible, solicita un enlace nuevo.");
  }

  const payload = [entity, id, action, docType ?? "", exp].join("|");
  const expected = await sign(payload);
  if (expected !== token) {
    return redirectToAdmin("Token inválido", "No se ha podido verificar la firma del enlace.");
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
        .maybeSingle();
      if (teamLookupError) throw teamLookupError;
      if (!currentTeam) {
        await sendOpsAlert(
          "warning",
          "Team action already processed or missing",
          `entity=team; action=${action}; id=${id}`,
        );
        return redirectToAdmin(
          "Acción ya procesada",
          `Este equipo ya no existe o ya fue revisado (${id}). Puedes continuar en el panel admin.`,
        );
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
          await sendOpsAlert(
            "warning",
            "Team approve affected 0 rows",
            `entity=team; action=${action}; id=${id}`,
          );
          return redirectToAdmin(
            "Acción ya procesada",
            `El equipo ya estaba revisado o no existe (${id}).`,
          );
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

      return redirectToAdmin(
        action === "approve" ? "Equipo aprobado" : "Equipo rechazado",
        action === "approve"
          ? `La revisión del equipo se ha guardado correctamente (${id}).`
          : `Equipo rechazado y eliminado (${id}). Para inscribirse, deberá rellenar de nuevo el formulario.`,
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
        await sendOpsAlert(
          "warning",
          "Player document action affected 0 rows",
          `entity=player-doc; action=${action}; docType=${docType}; id=${id}`,
        );
        return redirectToAdmin(
          "Acción ya procesada",
          `El documento ya estaba revisado o el jugador no existe (${id}).`,
        );
      }

      const label = docType === "dni" ? "DNI" : "seguro";
      return redirectToAdmin(
        action === "approve" ? `${label} aprobado` : `${label} rechazado`,
        `La revisión del documento del jugador se ha guardado correctamente (${id}).`,
      );
    }

    return redirectToAdmin("Entidad inválida", "El enlace no apunta a una revisión reconocida.");
  } catch (error) {
    await sendOpsAlert("error", "Error processing admin review action", getErrorMessage(error));
    return redirectToAdmin("Error al procesar acción", getErrorMessage(error));
  }
});
