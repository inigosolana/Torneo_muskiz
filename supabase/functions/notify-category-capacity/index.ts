import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const N8N_WH_URL = Deno.env.get("N8N_WH_URL");
const TELEGRAM_ADMIN_CHAT_IDS = Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS");
const OPS_ALERT_URL = `${SUPABASE_URL}/functions/v1/notify-ops-alert`;

function buildMessage(lines: string[]) {
  return [
    "RESUMEN DE PLAZAS (12H)",
    "",
    "Plazas disponibles por categoria (pendientes y aprobadas ocupan plaza):",
    ...lines,
  ].join("\n");
}

Deno.serve(async () => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !N8N_WH_URL) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno requeridas." }), { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("name, max_teams")
      .order("name", { ascending: true });
    if (categoriesError) throw categoriesError;

    const { data: occupiedTeams, error: occupiedError } = await supabase
      .from("teams")
      .select("division")
      .in("status", ["pending", "approved"]);
    if (occupiedError) throw occupiedError;

    const approvedByDivision = new Map<string, number>();
    for (const team of occupiedTeams ?? []) {
      const division = team.division ?? "Sin categoria";
      approvedByDivision.set(division, (approvedByDivision.get(division) ?? 0) + 1);
    }

    const lines = (categories ?? []).map((category) => {
      const maxTeams = Number(category.max_teams ?? 0);
      const used = approvedByDivision.get(category.name) ?? 0;
      const remaining = Math.max(maxTeams - used, 0);
      return `- ${category.name}: ${remaining}/${maxTeams} libres`;
    });

    const message = buildMessage(lines);

    await fetch(N8N_WH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "category-capacity-report",
        adminChatIds: TELEGRAM_ADMIN_CHAT_IDS,
        message,
      }),
    });

    return new Response(JSON.stringify({ success: true, categories: lines.length }), { status: 200 });
  } catch (error) {
    try {
      await fetch(OPS_ALERT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "backend.notify-category-capacity",
          severity: "error",
          message: "Error generating capacity report",
          details: error instanceof Error ? error.message : String(error),
        }),
      });
    } catch {
      // ignore alert failures
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500 });
  }
});
