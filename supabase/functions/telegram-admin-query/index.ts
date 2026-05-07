import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
const TELEGRAM_VIEWER_CHAT_IDS = Deno.env.get("TELEGRAM_VIEWER_CHAT_IDS");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function allowedChatIds(): Set<number> {
  const joined = [TELEGRAM_ADMIN_CHAT_IDS, TELEGRAM_VIEWER_CHAT_IDS].filter(Boolean).join(",");
  return new Set(
    joined
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v)),
  );
}

async function getPlayerCountForTeam(supabase: ReturnType<typeof createClient>, teamId: string): Promise<number> {
  const { count } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  return count ?? 0;
}

async function getPlayersForTeam(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
): Promise<Array<{ name: string; role: string }>> {
  const { data, error } = await supabase
    .from("players")
    .select("name")
    .eq("team_id", teamId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({ name: p.name ?? "Sin nombre", role: "PLAYER" }));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as Record<string, unknown>;
    const message = maybe.message ?? maybe.error_description ?? maybe.error;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return String(error);
}

function normalize(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function extractTeamName(raw: string): string {
  const cleaned = raw
    .replace(/^\/\w+\s*/i, "")
    .replace(/^equipo\s+/i, "")
    .replace(/^jugadores\s+/i, "")
    .replace(/^estado\s+/i, "")
    .replace(/^esta apuntado\s+/i, "")
    .replace(/^cuantos jugadores tiene\s+/i, "")
    .trim();
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { chatId, text } = await req.json();
    const chatIdNumber = Number(chatId);
    const rawText = String(text ?? "");
    const query = normalize(rawText);
    const allowed = allowedChatIds();
    if (!allowed.has(chatIdNumber)) {
      return new Response(JSON.stringify({ message: "No autorizado para consultas." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (query === "/help" || query === "help" || query === "ayuda" || query === "/start") {
      return new Response(JSON.stringify({
        message: [
          "Consultas disponibles:",
          "- /inscripciones",
          "- /categorias",
          "- /equipo NOMBRE",
          "- /jugadores NOMBRE_EQUIPO",
          "- /plantilla NOMBRE_EQUIPO",
          "- /estado NOMBRE_EQUIPO",
        ].join("\n"),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (query.includes("inscripciones") || query === "/inscripciones" || query.includes("como van")) {
      const { count: pending } = await supabase.from("teams").select("id", { count: "exact", head: true }).eq("status", "pending");
      const { count: approved } = await supabase.from("teams").select("id", { count: "exact", head: true }).eq("status", "approved");
      const { count: rejected } = await supabase.from("teams").select("id", { count: "exact", head: true }).eq("status", "rejected");
      const total = (pending ?? 0) + (approved ?? 0) + (rejected ?? 0);

      return new Response(JSON.stringify({
        message: [
          "Estado de inscripciones:",
          `- Total: ${total}`,
          `- Pendientes: ${pending ?? 0}`,
          `- Aprobadas: ${approved ?? 0}`,
          `- Rechazadas: ${rejected ?? 0}`,
        ].join("\n"),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (query === "/categorias" || query.includes("categorias") || query.includes("categorias como van")) {
      const { data: categories, error: catError } = await supabase
        .from("categories")
        .select("name, max_teams")
        .order("name", { ascending: true });
      if (catError) throw catError;

      const { data: teamsRows, error: teamsError } = await supabase
        .from("teams")
        .select("division, status")
        .in("status", ["pending", "approved"]);
      if (teamsError) throw teamsError;

      const usedByCategory = new Map<string, number>();
      for (const row of teamsRows ?? []) {
        const division = row.division ?? "Sin categoria";
        usedByCategory.set(division, (usedByCategory.get(division) ?? 0) + 1);
      }

      const lines = (categories ?? []).map((c) => {
        const max = Number(c.max_teams ?? 0);
        const used = usedByCategory.get(c.name) ?? 0;
        const free = Math.max(max - used, 0);
        return `- ${c.name}: ${used}/${max} ocupadas, libres ${free}`;
      });

      return new Response(JSON.stringify({
        message: ["Cómo van las categorías (pendientes + aprobadas ocupan):", ...lines].join("\n"),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isTeamQuery = query.startsWith("/equipo") || query.startsWith("equipo ") || query.includes("esta apuntado");
    const isPlayersQuery = query.startsWith("/jugadores") || query.startsWith("jugadores ") || query.includes("cuantos jugadores");
    const isStatusQuery = query.startsWith("/estado") || query.startsWith("estado ");
    const isRosterQuery = query.startsWith("/plantilla") || query.startsWith("plantilla ") || query.includes("jugadores que hay en");

    if (isTeamQuery || isPlayersQuery || isStatusQuery || isRosterQuery) {
      const teamName = extractTeamName(rawText);
      if (!teamName) {
        return new Response(JSON.stringify({ message: "Indica el nombre del equipo. Ejemplo: /equipo Kolosaurios" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: teams, error } = await supabase
        .from("teams")
        .select("id, name, division, status, manager_name")
        .ilike("name", `%${teamName}%`)
        .limit(5);
      if (error) throw error;

      if (!teams || teams.length === 0) {
        return new Response(JSON.stringify({ message: `No encuentro equipos con nombre parecido a "${teamName}".` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const first = teams[0];
      if (isPlayersQuery) {
        const players = await getPlayersForTeam(supabase, first.id);
        return new Response(JSON.stringify({
          message: [
            `Equipo: ${first.name}`,
            `Categoría: ${first.division ?? "N/D"}`,
            `Estado: ${first.status ?? "N/D"}`,
            `Jugadores inscritos: ${players.length}`,
            ...players.slice(0, 25).map((p) => `- ${p.name} (${p.role})`),
            players.length > 25 ? `... y ${players.length - 25} más` : "",
          ].join("\n"),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (isRosterQuery) {
        const players = await getPlayersForTeam(supabase, first.id);
        return new Response(JSON.stringify({
          message: [
            `Plantilla de ${first.name}:`,
            `Total: ${players.length}`,
            ...players.slice(0, 40).map((p) => `- ${p.name} (${p.role})`),
            players.length > 40 ? `... y ${players.length - 40} más` : "",
          ].join("\n"),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (isStatusQuery || isTeamQuery) {
        const lines = teams.map((t) => `- ${t.name} | ${t.division ?? "N/D"} | ${t.status ?? "N/D"} | Responsable: ${t.manager_name ?? "N/D"}`);
        return new Response(JSON.stringify({
          message: [`Coincidencias para "${teamName}":`, ...lines].join("\n"),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({
      message: "No entendí la consulta. Usa /help para ver comandos.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
