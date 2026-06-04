/** Lógica compartida: payloads para Instagram / n8n / Stitch */

export const DIVISIONS = [
  "Infantil Femenino",
  "Infantil Masculino",
  "Cadete Femenino",
  "Cadete Masculino",
  "Juvenil Femenino",
  "Juvenil Masculino",
  "Senior Femenino",
  "Senior Masculino",
] as const;

export type Division = (typeof DIVISIONS)[number];

export const CODE_TO_DIVISION: Record<string, Division> = {
  IF: "Infantil Femenino",
  IM: "Infantil Masculino",
  CF: "Cadete Femenino",
  CM: "Cadete Masculino",
  JF: "Juvenil Femenino",
  JM: "Juvenil Masculino",
  SF: "Senior Femenino",
  SM: "Senior Masculino",
};

export type SocialTemplateKind =
  | "standings_group_feed"
  | "standings_group_story"
  | "group_phase_feed"
  | "group_phase_story"
  | "team_spotlight_feed"
  | "team_spotlight_story"
  | "team_story"
  | "results_day_story"
  | "results_day_feed"
  | "match_result_feed"
  | "match_result_story"
  | "live_digest";

export interface DbTeam {
  id: string;
  name: string;
  division: Division;
  competition_group: string | null;
  payment_status: string | null;
  city?: string | null;
  logo_url?: string | null;
}

export interface DbPlayer {
  id: string;
  team_id: string;
  name: string | null;
  surnames: string | null;
  number: number | null;
  role: string | null;
}

export function socialFormatSpec(kind: SocialTemplateKind): {
  width: number;
  height: number;
  aspect: string;
  label: string;
} {
  const isStory = kind.includes("story") || kind === "team_story";
  return isStory
    ? { width: 1080, height: 1920, aspect: "9:16", label: "Story 1080×1920" }
    : { width: 1080, height: 1080, aspect: "1:1", label: "Feed 1080×1080" };
}

export function templateKind(base: string, format: "story" | "feed"): SocialTemplateKind {
  return `${base}_${format}` as SocialTemplateKind;
}

export interface DbMatch {
  id: string;
  time: string;
  court: string;
  team_a_name: string;
  team_b_name: string;
  score_a: number | null;
  score_b: number | null;
  status: string;
  round: string | null;
  schedule_day: string | null;
}

export interface StandingsRow {
  position: number;
  team: string;
  played: number;
  won: number;
  points: number;
  goalDiff: number;
}

export interface SocialBrand {
  title: string;
  subtitle: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  webUrl: string;
  instagramHandle: string;
}

function normTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** URL pública del escudo (Stitch / n8n); alineado con constants/teamShields.ts */
export function resolvePublicTeamShieldUrl(teamName: string, logoFromDb?: string | null): string {
  const db = (logoFromDb ?? "").trim();
  if (db) {
    if (db.startsWith("http")) return db;
    return `${DEFAULT_BRAND.webUrl}${db.startsWith("/") ? db : `/${db}`}`;
  }
  const n = normTeamName(teamName);
  const base = DEFAULT_BRAND.webUrl;
  if (/\bkolosauri[oa]s?\b/.test(n)) return `${base}/logo_kolosaurios.png`;
  if (
    /\brose\s*camargo\b/.test(n) ||
    (/\bcamargo\b/.test(n) && /\brose\b/.test(n)) ||
    /\brose\s*camargo\s*beach\b/.test(n)
  ) {
    return `${base}/escudos/rose-camargo.png`;
  }
  if (/\barangoiti\b/.test(n) || /\barangoiti\s*ikastola\b/.test(n)) {
    return `${base}/escudos/arangoiti-ikastola.png`;
  }
  if (
    /\bcalasancio\b/.test(n) ||
    /\bclarasancio\b/.test(n) ||
    /\bc\.?\s*p\.?\s*calasancio\b/.test(n)
  ) {
    return `${base}/escudos/calasancio.png`;
  }
  if (
    /\bastillero\s*blues\b/.test(n) ||
    /\bblues\s*astillero\b/.test(n) ||
    /\bastillero\b/.test(n)
  ) {
    return `${base}/escudos/astillero-blues.png`;
  }
  return DEFAULT_BRAND.logoUrl;
}

export const DEFAULT_BRAND: SocialBrand = {
  title: "II Torneo Muskiz",
  subtitle: "Balonmano playa · Muskizko Udala",
  primaryColor: "#0df2f2",
  accentColor: "#0b0f14",
  logoUrl: "https://torneomuskizbmplaya.es/logo_kolosaurios.png",
  webUrl: "https://torneomuskizbmplaya.es",
  instagramHandle: "@kolosaurios_muskiz",
};

export function divisionFromRound(round?: string | null): Division | null {
  if (!round) return null;
  const m = /\b(CF|CM|JF|JM|SF|SM|IF|IM)\b/.exec(round);
  return m ? CODE_TO_DIVISION[m[1]] ?? null : null;
}

export function inferDay(m: DbMatch): string {
  if (m.schedule_day) return m.schedule_day;
  const p = (m.round ?? "").slice(0, 3).toLowerCase();
  if (p === "vie") return "Viernes";
  if (p === "sab") return "Sábado";
  if (p === "dom") return "Domingo";
  return "";
}

export function computeStandings(roster: DbTeam[], matches: DbMatch[]): StandingsRow[] {
  const names = new Set(roster.map((t) => t.name));
  const stats: Record<string, { played: number; won: number; points: number; gf: number; ga: number }> = {};
  for (const t of roster) stats[t.name] = { played: 0, won: 0, points: 0, gf: 0, ga: 0 };

  for (const m of matches) {
    if (m.status !== "FINISHED" || m.score_a == null || m.score_b == null) continue;
    if (!names.has(m.team_a_name) || !names.has(m.team_b_name)) continue;
    const a = stats[m.team_a_name]!;
    const b = stats[m.team_b_name]!;
    a.played += 1;
    b.played += 1;
    a.gf += m.score_a;
    a.ga += m.score_b;
    b.gf += m.score_b;
    b.ga += m.score_a;
    if (m.score_a > m.score_b) {
      a.won += 1;
      a.points += 3;
    } else if (m.score_b > m.score_a) {
      b.won += 1;
      b.points += 3;
    } else {
      a.points += 1;
      b.points += 1;
    }
  }

  return Object.entries(stats)
    .map(([team, s]) => ({
      position: 0,
      team,
      played: s.played,
      won: s.won,
      points: s.points,
      goalDiff: s.gf - s.ga,
    }))
    .sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff || x.team.localeCompare(y.team, "es"))
    .map((r, i) => ({ ...r, position: i + 1 }));
}

export function groupsInDivision(teams: DbTeam[], division: Division): string[] {
  const set = new Set<string>();
  for (const t of teams) {
    if (t.division !== division) continue;
    const g = (t.competition_group ?? "").trim();
    if (g) set.add(g);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

export function buildStandingsPayload(
  division: Division,
  groupKey: string,
  teams: DbTeam[],
  matches: DbMatch[],
  kind: SocialTemplateKind,
): Record<string, unknown> {
  const roster = teams.filter(
    (t) => t.division === division && (t.competition_group ?? "").trim() === groupKey,
  );
  const groupMatches = matches.filter((m) => {
    const names = new Set(roster.map((t) => t.name));
    return names.has(m.team_a_name) && names.has(m.team_b_name);
  });
  const standings = computeStandings(roster, groupMatches);
  const fmt = socialFormatSpec(kind);

  return {
    eventType: "torneo-social-content",
    template: kind,
    format: { width: fmt.width, height: fmt.height, aspect: fmt.aspect, label: fmt.label },
    brand: DEFAULT_BRAND,
    division,
    group: groupKey,
    headline: `Clasificación · ${division}`,
    subheadline: `Grupo ${groupKey}`,
    standings,
    stitch: {
      title: division,
      subtitle: `Grupo ${groupKey}`,
      rows: standings.slice(0, 8).map((r) => ({
        pos: String(r.position),
        team: r.team,
        pts: String(r.points),
        pj: String(r.played),
      })),
    },
    captionDraft: buildStandingsCaption(division, groupKey, standings),
    generatedAt: new Date().toISOString(),
  };
}

function buildStandingsCaption(division: string, group: string, standings: StandingsRow[]): string {
  const top = standings.slice(0, 4).map((r) => `${r.position}. ${r.team} (${r.points} pts)`).join("\n");
  return [
    `🏐 Clasificación ${division} — Grupo ${group}`,
    "",
    top,
    "",
    "II Torneo Muskiz · Balonmano playa",
    "#TorneoMuskiz #BalonmanoPlaya #Muskiz",
  ].join("\n");
}

export function buildDayResultsPayload(
  scheduleDay: string,
  teams: DbTeam[],
  matches: DbMatch[],
): Record<string, unknown> {
  const finished = matches
    .filter((m) => m.status === "FINISHED" && inferDay(m) === scheduleDay)
    .sort((a, b) => a.time.localeCompare(b.time, "es"));

  const results = finished.map((m) => ({
    time: m.time,
    court: m.court,
    teamA: m.team_a_name,
    teamB: m.team_b_name,
    score:
      m.score_a != null && m.score_b != null ? `${m.score_a}:${m.score_b}` : "—",
    division: divisionFromRound(m.round) ?? "",
  }));

  const kind: SocialTemplateKind = "results_day_story";
  const fmt = socialFormatSpec(kind);

  return {
    eventType: "torneo-social-content",
    template: kind,
    format: { width: fmt.width, height: fmt.height, aspect: fmt.aspect, label: fmt.label },
    brand: DEFAULT_BRAND,
    scheduleDay,
    headline: `Resultados · ${scheduleDay}`,
    results: results.slice(0, 12),
    stitch: {
      title: scheduleDay,
      subtitle: "Resultados del día",
      rows: results.slice(0, 10).map((r) => ({
        line1: `${r.time} ${r.court}`,
        line2: `${r.teamA} ${r.score} ${r.teamB}`,
      })),
    },
    captionDraft: [
      `📊 Resultados ${scheduleDay} — II Torneo Muskiz`,
      "",
      ...results.slice(0, 8).map((r) => `• ${r.teamA} ${r.score} ${r.teamB} (${r.time})`),
      "",
      "#TorneoMuskiz #BalonmanoPlaya",
    ].join("\n"),
    generatedAt: new Date().toISOString(),
  };
}

export function buildResultsDayPayload(
  scheduleDay: string,
  teams: DbTeam[],
  matches: DbMatch[],
  format: "story" | "feed",
): Record<string, unknown> {
  const kind = templateKind("results_day", format);
  const base = buildDayResultsPayload(scheduleDay, teams, matches);
  return { ...base, template: kind, format: socialFormatSpec(kind) };
}

export function buildGroupPhasePayload(
  division: Division,
  teams: DbTeam[],
  matches: DbMatch[],
  format: "story" | "feed",
): Record<string, unknown> {
  const kind = templateKind("group_phase", format);
  const fmt = socialFormatSpec(kind);
  const groups = groupsInDivision(teams, division);
  const blocks: { group: string; lines: string[] }[] = [];

  for (const g of groups) {
    const roster = teams.filter(
      (t) => t.division === division && (t.competition_group ?? "").trim() === g,
    );
    const standings = computeStandings(roster, matches);
    const lines = standings.slice(0, 4).map((r) => `${r.position}. ${r.team} (${r.points}p)`);
    blocks.push({ group: g, lines });
  }

  const stitchRows = blocks.flatMap((b) => [
    { line1: `Grupo ${b.group}`, line2: b.lines.join(" · ") || "—" },
  ]);

  return {
    eventType: "torneo-social-content",
    template: kind,
    format: { width: fmt.width, height: fmt.height, aspect: fmt.aspect, label: fmt.label },
    brand: DEFAULT_BRAND,
    division,
    headline: `Fase de grupos · ${division}`,
    subheadline: `${groups.length} grupos`,
    groupBlocks: blocks,
    stitch: {
      title: "FASE DE GRUPOS",
      subtitle: division,
      rows: stitchRows.slice(0, 8),
    },
    captionDraft: [
      `🏐 Fase de grupos — ${division}`,
      "",
      ...blocks.map((b) => `Grupo ${b.group}: ${b.lines.slice(0, 3).join(", ")}`),
      "",
      "II Torneo Muskiz · Balonmano playa",
      "#TorneoMuskiz #BalonmanoPlaya #Muskiz",
    ].join("\n"),
    generatedAt: new Date().toISOString(),
  };
}

function playerDisplayName(p: DbPlayer): string {
  const n = [p.name, p.surnames].filter(Boolean).join(" ").trim();
  return n || "Jugador";
}

export function findTeamByHint(teams: DbTeam[], hint: string): DbTeam | null {
  const n = hint.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const candidates = teams.filter((t) => {
    const tn = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return tn.includes(n) || n.includes(tn);
  });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.name.length - b.name.length)[0]!;
}

export function buildTeamSpotlightPayload(
  team: DbTeam,
  allTeams: DbTeam[],
  players: DbPlayer[],
  matches: DbMatch[],
  format: "story" | "feed",
): Record<string, unknown> {
  const kind = templateKind("team_spotlight", format);
  const fmt = socialFormatSpec(kind);
  const teamNames = new Set([team.name]);
  const roster = players.filter((p) => p.team_id === team.id && (p.role ?? "PLAYER") === "PLAYER");

  const upcoming = matches
    .filter((m) => m.status !== "FINISHED" && (teamNames.has(m.team_a_name) || teamNames.has(m.team_b_name)))
    .sort((a, b) => a.time.localeCompare(b.time, "es"))[0];

  const rival = upcoming
    ? (upcoming.team_a_name === team.name ? upcoming.team_b_name : upcoming.team_a_name)
    : "—";

  const baseCity = (team.city ?? "").trim();
  const sisterTeams = baseCity
    ? allTeams.filter((t) => t.id !== team.id && (t.city ?? "").trim() === baseCity).map((t) => t.name)
    : [];

  const stitchRows = roster.slice(0, 14).map((p) => ({
    line1: `#${p.number ?? "—"} ${playerDisplayName(p)}`,
    line2: baseCity || team.division,
  }));

  return {
    eventType: "torneo-social-content",
    template: kind,
    format: { width: fmt.width, height: fmt.height, aspect: fmt.aspect, label: fmt.label },
    brand: DEFAULT_BRAND,
    team: {
      name: team.name,
      division: team.division,
      group: team.competition_group ?? "",
      city: baseCity,
      logoUrl: resolvePublicTeamShieldUrl(team.name, team.logo_url),
    },
    upcoming: upcoming
      ? {
          day: inferDay(upcoming),
          time: upcoming.time,
          court: upcoming.court,
          rival,
        }
      : null,
    sisterTeams,
    stitch: {
      title: team.name,
      subtitle: upcoming ? `vs ${rival} · ${inferDay(upcoming)} ${upcoming.time}` : "Sin partido pendiente",
      rows: stitchRows,
      meta: `${team.division} · Grupo ${team.competition_group ?? "—"}`,
      shieldUrl: resolvePublicTeamShieldUrl(team.name, team.logo_url),
    },
    captionDraft: [
      `🏖️ ${team.name} en el II Torneo Muskiz`,
      upcoming ? `📅 Próximo: vs ${rival} — ${inferDay(upcoming)} ${upcoming.time} (${upcoming.court})` : "",
      baseCity ? `📍 Base: ${baseCity}` : "",
      sisterTeams.length ? `Equipos del club (${baseCity}): ${sisterTeams.join(", ")}` : "",
      "",
      "#TorneoMuskiz #BalonmanoPlaya #Muskiz",
    ].filter(Boolean).join("\n"),
    generatedAt: new Date().toISOString(),
  };
}

export function buildTeamStoryPayload(
  team: DbTeam,
  allTeams: DbTeam[],
  players: DbPlayer[],
  matches: DbMatch[],
): Record<string, unknown> {
  const kind: SocialTemplateKind = "team_story";
  const fmt = socialFormatSpec(kind);
  const spotlight = buildTeamSpotlightPayload(team, allTeams, players, matches, "story");
  const teamNames = new Set([team.name]);
  const last = matches
    .filter((m) => m.status === "FINISHED" && (teamNames.has(m.team_a_name) || teamNames.has(m.team_b_name)))
    .sort((a, b) => b.time.localeCompare(a.time, "es"))[0];

  const groupRoster = allTeams.filter(
    (t) => t.division === team.division && (t.competition_group ?? "").trim() === (team.competition_group ?? "").trim(),
  );
  const standings = computeStandings(groupRoster, matches);
  const pos = standings.find((r) => r.team === team.name);

  let lastLine = "";
  if (last && last.score_a != null && last.score_b != null) {
    const score = last.team_a_name === team.name
      ? `${last.score_a}:${last.score_b}`
      : `${last.score_b}:${last.score_a}`;
    const opp = last.team_a_name === team.name ? last.team_b_name : last.team_a_name;
    lastLine = `Último: ${score} vs ${opp}`;
  }

  return {
    ...spotlight,
    template: kind,
    format: { width: fmt.width, height: fmt.height, aspect: fmt.aspect, label: fmt.label },
    standing: pos ? { position: pos.position, points: pos.points, played: pos.played } : null,
    stitch: {
      ...(spotlight.stitch as Record<string, unknown>),
      title: `HISTORIA · ${team.name}`,
      line3: lastLine,
      position: pos ? `${pos.position}º (${pos.points} pts)` : "",
    },
    captionDraft: [
      `📱 Historia — ${team.name}`,
      pos ? `🏐 ${pos.position}º en grupo ${team.competition_group ?? "—"} (${pos.points} pts)` : "",
      lastLine,
      (spotlight.upcoming as { rival?: string; day?: string; time?: string } | null)
        ? `⏭ Próximo vs ${(spotlight.upcoming as { rival: string }).rival}`
        : "",
      "",
      "#TorneoMuskiz #BalonmanoPlaya",
    ].filter(Boolean).join("\n"),
    generatedAt: new Date().toISOString(),
  };
}

export function buildMatchPayload(match: DbMatch, kind: SocialTemplateKind): Record<string, unknown> {
  const fmt = socialFormatSpec(kind);
  const score =
    match.score_a != null && match.score_b != null
      ? `${match.score_a}:${match.score_b}`
      : "Final";
  return {
    eventType: "torneo-social-content",
    template: kind,
    format: { width: fmt.width, height: fmt.height, aspect: fmt.aspect, label: fmt.label },
    brand: DEFAULT_BRAND,
    match: {
      id: match.id,
      day: inferDay(match),
      time: match.time,
      court: match.court,
      teamA: match.team_a_name,
      teamB: match.team_b_name,
      score,
      round: match.round ?? "",
    },
    stitch: {
      title: "RESULTADO",
      teamA: match.team_a_name,
      teamB: match.team_b_name,
      score,
      meta: `${inferDay(match)} ${match.time} · ${match.court}`,
      shieldUrlA: resolvePublicTeamShieldUrl(match.team_a_name),
      shieldUrlB: resolvePublicTeamShieldUrl(match.team_b_name),
    },
    captionDraft: [
      `🏖️ ${match.team_a_name} ${score} ${match.team_b_name}`,
      `${inferDay(match)} ${match.time} · ${match.court}`,
      "",
      "II Torneo Muskiz",
      "#TorneoMuskiz #BalonmanoPlaya",
    ].join("\n"),
    generatedAt: new Date().toISOString(),
  };
}

export function buildLiveDigest(teams: DbTeam[], matches: DbMatch[]): Record<string, unknown> {
  const groups: { division: Division; group: string; teamCount: number }[] = [];
  for (const div of DIVISIONS) {
    for (const g of groupsInDivision(teams, div)) {
      const count = teams.filter(
        (t) => t.division === div && (t.competition_group ?? "").trim() === g,
      ).length;
      groups.push({ division: div, group: g, teamCount: count });
    }
  }
  const upcoming = matches
    .filter((m) => m.status !== "FINISHED")
    .slice(0, 15)
    .map((m) => ({
      day: inferDay(m),
      time: m.time,
      teams: `${m.team_a_name} vs ${m.team_b_name}`,
    }));

  return {
    eventType: "torneo-social-live-digest",
    brand: DEFAULT_BRAND,
    groups,
    upcoming,
    groupCount: groups.length,
    generatedAt: new Date().toISOString(),
  };
}
