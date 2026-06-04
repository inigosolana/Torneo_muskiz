import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  buildDayResultsPayload,
  buildLiveDigest,
  buildMatchPayload,
  buildStandingsPayload,
  groupsInDivision,
  DIVISIONS,
  type Division,
} from "../_shared/socialContentCore.ts";
import { sendDraftToReviewTelegram } from "../_shared/socialTelegramReview.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const N8N_SOCIAL_WH_URL = Deno.env.get("N8N_SOCIAL_WH_URL") ?? Deno.env.get("N8N_WH_URL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

async function maybeSendTelegram(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  skip: boolean,
): Promise<{ sent: boolean; draftId?: string; error?: string }> {
  if (skip) return { sent: false };
  return sendDraftToReviewTelegram(supabase, payload);
}

async function postToN8n(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number }> {
  if (!N8N_SOCIAL_WH_URL) {
    return { ok: false, status: 0 };
  }
  const res = await fetch(N8N_SOCIAL_WH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const mode = String(body.mode ?? "single");
    const skipTelegram = body.skipTelegram === true;
    const skipN8n = body.skipN8n === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, division, competition_group, payment_status")
      .eq("status", "approved")
      .eq("payment_status", "PAID");
    const { data: matches } = await supabase
      .from("matches")
      .select(
        "id, time, court, team_a_name, team_b_name, score_a, score_b, status, round, schedule_day, is_public",
      )
      .eq("is_public", true);

    const paidTeams = teams ?? [];
    const publicMatches = matches ?? [];
    const sent: { template: string; ok: boolean }[] = [];

    if (mode === "all_groups") {
      for (const division of DIVISIONS) {
        for (const groupKey of groupsInDivision(paidTeams, division)) {
          const payload = buildStandingsPayload(
            division,
            groupKey,
            paidTeams,
            publicMatches,
            "standings_group_story",
          );
          const r = skipN8n ? { ok: true, status: 0 } : await postToN8n(payload);
          await maybeSendTelegram(supabase, payload, skipTelegram);
          sent.push({ template: `standings_${division}_${groupKey}`, ok: r.ok });
        }
      }
      return new Response(JSON.stringify({ ok: true, mode, sent, n8nConfigured: !!N8N_SOCIAL_WH_URL }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "day_results") {
      const scheduleDay = String(body.scheduleDay ?? "Sábado");
      const payload = buildDayResultsPayload(scheduleDay, paidTeams, publicMatches);
      const r = skipN8n ? { ok: true, status: 0 } : await postToN8n(payload);
      const tg = await maybeSendTelegram(supabase, payload, skipTelegram);
      return new Response(
        JSON.stringify({ ok: r.ok, payload, n8nConfigured: !!N8N_SOCIAL_WH_URL, telegram: tg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.payload && typeof body.payload === "object") {
      const pl = body.payload as Record<string, unknown>;
      const r = skipN8n ? { ok: true, status: 0 } : await postToN8n(pl);
      const tg = await maybeSendTelegram(supabase, pl, skipTelegram);
      return new Response(JSON.stringify({ ok: r.ok, n8nConfigured: !!N8N_SOCIAL_WH_URL, telegram: tg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = String(body.contentType ?? "standings_group");
    const division = String(body.division ?? "Senior Masculino") as Division;
    const groupKey = String(body.groupKey ?? "A");
    const scheduleDay = String(body.scheduleDay ?? "Sábado");
    const matchId = String(body.matchId ?? "");

    let payload: Record<string, unknown>;
    if (contentType === "standings_group") {
      payload = buildStandingsPayload(division, groupKey, paidTeams, publicMatches, "standings_group_story");
    } else if (contentType === "results_day") {
      payload = buildDayResultsPayload(scheduleDay, paidTeams, publicMatches);
    } else if (contentType === "match_result" && matchId) {
      const match = publicMatches.find((m) => m.id === matchId);
      if (!match) {
        return new Response(JSON.stringify({ error: "Partido no encontrado" }), { status: 404 });
      }
      payload = buildMatchPayload(match, "match_result_story");
    } else {
      payload = buildLiveDigest(paidTeams, publicMatches);
    }

    const r = skipN8n ? { ok: true, status: 0 } : await postToN8n(payload);
    const tg = await maybeSendTelegram(supabase, payload, skipTelegram);
    return new Response(
      JSON.stringify({
        ok: r.ok,
        status: r.status,
        payload,
        n8nConfigured: !!N8N_SOCIAL_WH_URL,
        telegram: tg,
        hint: r.ok ? undefined : "Configura N8N_SOCIAL_WH_URL en Supabase secrets",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
