import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  buildDayResultsPayload,
  buildLiveDigest,
  buildMatchPayload,
  buildStandingsPayload,
  DIVISIONS,
  type Division,
  type SocialTemplateKind,
} from "../_shared/socialContentCore.ts";
import { sendDraftToReviewTelegram } from "../_shared/socialTelegramReview.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SCHEDULE_VISIBILITY_KEY = "schedule_visibility";

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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const contentType = String(body.contentType ?? "live_digest");
    const division = String(body.division ?? "") as Division;
    const groupKey = String(body.groupKey ?? "").trim();
    const scheduleDay = String(body.scheduleDay ?? "Sábado");
    const matchId = String(body.matchId ?? "");
    const template = String(body.template ?? contentType) as SocialTemplateKind;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: visRow } = await supabase
      .from("site_content")
      .select("value")
      .eq("key", SCHEDULE_VISIBILITY_KEY)
      .maybeSingle();
    const publicVisible = !!(visRow?.value as { publicMatchesVisible?: boolean } | undefined)?.publicMatchesVisible;

    const { data: teams, error: tErr } = await supabase
      .from("teams")
      .select("id, name, division, competition_group, payment_status")
      .eq("status", "approved")
      .eq("payment_status", "PAID");
    if (tErr) throw tErr;

    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .select(
        "id, time, court, team_a_name, team_b_name, score_a, score_b, status, round, schedule_day, is_public",
      )
      .eq("is_public", true);
    if (mErr) throw mErr;

    const paidTeams = teams ?? [];
    const publicMatches = matches ?? [];

    if (!publicVisible && contentType !== "live_digest") {
      return new Response(
        JSON.stringify({ error: "Calendario no publicado aún", publicVisible: false }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let payload: Record<string, unknown>;

    if (contentType === "live_digest") {
      payload = buildLiveDigest(paidTeams, publicMatches);
    } else if (contentType === "standings_group") {
      if (!DIVISIONS.includes(division) || !groupKey) {
        return new Response(JSON.stringify({ error: "division y groupKey requeridos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      payload = buildStandingsPayload(
        division,
        groupKey,
        paidTeams,
        publicMatches,
        template.includes("story") ? template : "standings_group_feed",
      );
    } else if (contentType === "results_day") {
      payload = buildDayResultsPayload(scheduleDay, paidTeams, publicMatches);
    } else if (contentType === "match_result") {
      if (!matchId) {
        return new Response(JSON.stringify({ error: "matchId requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const match = publicMatches.find((m) => m.id === matchId);
      if (!match) {
        return new Response(JSON.stringify({ error: "Partido no encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      payload = buildMatchPayload(match, template.includes("story") ? template : "match_result_feed");
    } else {
      return new Response(JSON.stringify({ error: "contentType no válido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let telegram: { sent: boolean; draftId?: string; error?: string } | undefined;
    if (body.sendToTelegram === true) {
      telegram = await sendDraftToReviewTelegram(supabase, payload);
    }

    return new Response(JSON.stringify({ ok: true, payload, telegram }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
