/** Genera payloads desde comandos del bot Telegram */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { SocialBotCommand } from "./socialBotCommands.ts";
import {
  buildGroupPhasePayload,
  buildMatchPayload,
  buildResultsDayPayload,
  buildStandingsPayload,
  buildTeamSpotlightPayload,
  buildTeamStoryPayload,
  findTeamByHint,
  templateKind,
  type DbMatch,
  type DbPlayer,
  type DbTeam,
} from "./socialContentCore.ts";

const SCHEDULE_VISIBILITY_KEY = "schedule_visibility";

export async function fetchSocialTournamentData(supabase: SupabaseClient): Promise<{
  publicVisible: boolean;
  teams: DbTeam[];
  players: DbPlayer[];
  matches: DbMatch[];
}> {
  const { data: visRow } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", SCHEDULE_VISIBILITY_KEY)
    .maybeSingle();
  const publicVisible = !!(visRow?.value as { publicMatchesVisible?: boolean } | undefined)
    ?.publicMatchesVisible;

  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .select("id, name, division, competition_group, payment_status, city, logo_url")
    .eq("status", "approved")
    .eq("payment_status", "PAID");
  if (tErr) throw new Error(tErr.message ?? JSON.stringify(tErr));

  const paid = teams ?? [];
  const teamIds = paid.map((t) => t.id);
  let players: DbPlayer[] = [];
  if (teamIds.length) {
    const { data: pl, error: pErr } = await supabase
      .from("players")
      .select("id, team_id, name, surnames, number, role")
      .in("team_id", teamIds);
    if (pErr) throw new Error(pErr.message ?? JSON.stringify(pErr));
    players = (pl ?? []) as DbPlayer[];
  }

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select(
      "id, time, court, team_a_name, team_b_name, score_a, score_b, status, round, schedule_day, is_public",
    )
    .eq("is_public", true);
  if (mErr) throw new Error(mErr.message ?? JSON.stringify(mErr));

  return {
    publicVisible,
    teams: paid as DbTeam[],
    players,
    matches: (matches ?? []) as DbMatch[],
  };
}

export async function generateFromSocialBotCommand(
  supabase: SupabaseClient,
  cmd: SocialBotCommand,
): Promise<{ payload: Record<string, unknown> } | { error: string }> {
  const { publicVisible, teams, players, matches } = await fetchSocialTournamentData(supabase);

  if (!publicVisible && cmd.type !== "help" && cmd.type !== "lista") {
    return { error: "El calendario oficial aún no está publicado en la web." };
  }

  switch (cmd.type) {
    case "help":
    case "lista":
      return { error: "Comando interno" };

    case "grupos":
      return {
        payload: buildGroupPhasePayload(cmd.division, teams, matches, cmd.format),
      };

    case "clasificacion": {
      const kind = templateKind("standings_group", cmd.format);
      return {
        payload: buildStandingsPayload(cmd.division, cmd.group, teams, matches, kind),
      };
    }

    case "equipo": {
      const team = findTeamByHint(teams, cmd.teamHint);
      if (!team) return { error: `No encuentro el equipo «${cmd.teamHint}».` };
      return {
        payload: buildTeamSpotlightPayload(team, teams, players, matches, cmd.format),
      };
    }

    case "historia": {
      const team = findTeamByHint(teams, cmd.teamHint);
      if (!team) return { error: `No encuentro el equipo «${cmd.teamHint}».` };
      return { payload: buildTeamStoryPayload(team, teams, players, matches) };
    }

    case "resultados":
      return {
        payload: buildResultsDayPayload(cmd.scheduleDay, teams, matches, cmd.format),
      };

    case "partido": {
      const team = findTeamByHint(teams, cmd.teamHint);
      if (!team) return { error: `No encuentro el equipo «${cmd.teamHint}».` };
      const names = new Set([team.name]);
      const last = matches
        .filter(
          (m) =>
            m.status === "FINISHED" &&
            (names.has(m.team_a_name) || names.has(m.team_b_name)),
        )
        .sort((a, b) => b.time.localeCompare(a.time, "es"))[0];
      if (!last) return { error: `Sin resultados publicados para ${team.name}.` };
      const kind = templateKind("match_result", cmd.format);
      return { payload: buildMatchPayload(last, kind) };
    }

    default:
      return { error: "Comando no reconocido" };
  }
}
