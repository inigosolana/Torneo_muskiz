import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SCHEDULE_VISIBILITY_KEY = "schedule_visibility";
const WEB_URL = "https://torneomuskizbmplaya.es";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DIVISIONS = [
  "Infantil Femenino",
  "Infantil Masculino",
  "Cadete Femenino",
  "Cadete Masculino",
  "Juvenil Femenino",
  "Juvenil Masculino",
  "Senior Femenino",
  "Senior Masculino",
] as const;

type Division = (typeof DIVISIONS)[number];

const CODE_TO_DIVISION: Record<string, Division> = {
  IF: "Infantil Femenino",
  IM: "Infantil Masculino",
  CF: "Cadete Femenino",
  CM: "Cadete Masculino",
  JF: "Juvenil Femenino",
  JM: "Juvenil Masculino",
  SF: "Senior Femenino",
  SM: "Senior Masculino",
};

const DAY_ORDER: Record<string, number> = { Viernes: 0, Sábado: 1, Sabado: 1, Domingo: 2 };

type DbTeam = {
  id: string;
  name: string;
  division: Division;
  competition_group: string | null;
  payment_status: string | null;
  status: string | null;
};

type DbMatch = {
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
  is_public: boolean | null;
};

type FanCommand =
  | { type: "help" }
  | { type: "resultados"; hint: string }
  | { type: "clasificacion"; hint: string }
  | { type: "siguiente"; hint: string };

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractAfterKeyword(raw: string, keyword: string): string {
  const re = new RegExp(`^/?${keyword}\\s*`, "i");
  return raw.replace(re, "").trim();
}

function parseFanCommand(raw: string): FanCommand | null {
  const q = normalize(raw);
  if (!q) return null;
  if (q === "/start" || q === "/help" || q === "help" || q === "ayuda" || q.startsWith("/help ")) {
    return { type: "help" };
  }
  if (q.startsWith("/resultados") || q.startsWith("resultados ")) {
    return { type: "resultados", hint: extractAfterKeyword(raw, "resultados") };
  }
  if (q.startsWith("/clasificacion") || q.startsWith("clasificacion ")) {
    return { type: "clasificacion", hint: extractAfterKeyword(raw, "clasificacion") };
  }
  if (q.startsWith("/siguiente") || q.startsWith("siguiente")) {
    const hint = extractAfterKeyword(raw, "siguiente").replace(/^partido\s+/i, "").trim();
    return { type: "siguiente", hint };
  }
  if (q.startsWith("/proximo") || q.startsWith("proximo")) {
    const hint = extractAfterKeyword(raw, "proximo").replace(/^partido\s+/i, "").trim();
    return { type: "siguiente", hint };
  }
  return null;
}

function resolveDivisions(hint: string): Division[] {
  const n = normalize(hint);
  if (!n) return [];

  const pick = (div: Division, patterns: RegExp[]): Division | null =>
    patterns.some((p) => p.test(n)) ? div : null;

  const hits: Division[] = [];
  const rules: Array<{ div: Division; patterns: RegExp[] }> = [
    { div: "Senior Masculino", patterns: [/\bsm\b/, /senior\s*masc/, /senior\s*masculino/] },
    { div: "Senior Femenino", patterns: [/\bsf\b/, /senior\s*fem/, /senior\s*femenino/] },
    { div: "Juvenil Masculino", patterns: [/\bjm\b/, /juvenil\s*masc/, /juvenil\s*masculino/] },
    { div: "Juvenil Femenino", patterns: [/\bjf\b/, /juvenil\s*fem/, /juvenil\s*femenino/] },
    { div: "Cadete Masculino", patterns: [/\bcm\b/, /cadete\s*masc/, /cadete\s*masculino/] },
    { div: "Cadete Femenino", patterns: [/\bcf\b/, /cadete\s*fem/, /cadete\s*femenino/] },
    { div: "Infantil Masculino", patterns: [/\bim\b/, /infantil\s*masc/, /infantil\s*masculino/] },
    { div: "Infantil Femenino", patterns: [/\bif\b/, /infantil\s*fem/, /infantil\s*femenino/] },
  ];

  for (const { div, patterns } of rules) {
    const m = pick(div, patterns);
    if (m) hits.push(m);
  }

  if (hits.length > 0) return [...new Set(hits)];

  if (/\bsenior\b/.test(n)) return ["Senior Masculino", "Senior Femenino"];
  if (/\bjuvenil\b/.test(n)) return ["Juvenil Masculino", "Juvenil Femenino"];
  if (/\bcadete\b/.test(n)) return ["Cadete Masculino", "Cadete Femenino"];
  if (/\binfantil\b/.test(n)) return ["Infantil Masculino", "Infantil Femenino"];

  for (const div of DIVISIONS) {
    if (normalize(div).includes(n) || n.includes(normalize(div))) hits.push(div);
  }
  return [...new Set(hits)];
}

function divisionFromRound(round?: string | null): Division | null {
  if (!round) return null;
  const m = /\b(CF|CM|JF|JM|SF|SM|IF|IM)\b/.exec(round);
  return m ? CODE_TO_DIVISION[m[1]] ?? null : null;
}

function resolveMatchDivision(m: DbMatch, teams: DbTeam[]): Division | null {
  const fromRound = divisionFromRound(m.round);
  if (fromRound) return fromRound;
  const names = new Set([m.team_a_name, m.team_b_name]);
  const divs = teams.filter((t) => names.has(t.name)).map((t) => t.division);
  if (divs.length === 1) return divs[0]!;
  return null;
}

function inferDay(m: DbMatch): string {
  if (m.schedule_day) return m.schedule_day;
  const p = (m.round ?? "").slice(0, 3).toLowerCase();
  if (p === "vie") return "Viernes";
  if (p === "sab") return "Sábado";
  if (p === "dom") return "Domingo";
  return "";
}

function timeSortKey(time: string): number {
  if (time === "PENDIENTE") return 99999;
  const [h, mi] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (mi ?? 0);
}

function scoreLine(m: DbMatch): string {
  if (m.status === "FINISHED" && m.score_a != null && m.score_b != null) {
    return `${m.score_a}:${m.score_b}`;
  }
  if (m.status === "FINISHED") return "Finalizado";
  return "—";
}

interface StandingsRow {
  name: string;
  played: number;
  won: number;
  points: number;
  gf: number;
  ga: number;
}

function computeStandings(roster: DbTeam[], matches: DbMatch[]): StandingsRow[] {
  const names = new Set(roster.map((t) => t.name));
  const stats: Record<string, StandingsRow> = {};
  for (const t of roster) {
    stats[t.name] = { name: t.name, played: 0, won: 0, points: 0, gf: 0, ga: 0 };
  }
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.score_a == null || m.score_b == null) continue;
    if (!names.has(m.team_a_name) || !names.has(m.team_b_name)) continue;
    const a = stats[m.team_a_name] ?? { name: m.team_a_name, played: 0, won: 0, points: 0, gf: 0, ga: 0 };
    const b = stats[m.team_b_name] ?? { name: m.team_b_name, played: 0, won: 0, points: 0, gf: 0, ga: 0 };
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
    stats[m.team_a_name] = a;
    stats[m.team_b_name] = b;
  }
  return Object.values(stats).sort((x, y) =>
    y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || x.name.localeCompare(y.name, "es")
  );
}

function helpMessage(): string {
  return [
    "🏐 II Torneo Muskiz — consultas públicas",
    "",
    "Comandos (cualquier chat):",
    "• /resultados senior — últimos resultados (también: juvenil, cadete, infantil…)",
    "• /clasificacion juvenil — clasificación por grupos",
    "• /siguiente partido Kolosaurios — próximo partido de un equipo",
    "",
    "Ejemplos:",
    "  /resultados senior masculino",
    "  /clasificacion sf",
    "  /proximo partido Kolosaurias JF",
    "",
    `Web: ${WEB_URL}`,
  ].join("\n");
}

async function fetchPublicData(supabase: ReturnType<typeof createClient>) {
  const { data: visRow } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", SCHEDULE_VISIBILITY_KEY)
    .maybeSingle();
  const publicVisible = !!(visRow?.value as { publicMatchesVisible?: boolean } | undefined)?.publicMatchesVisible;

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, name, division, competition_group, payment_status, status")
    .eq("status", "approved");
  if (teamsErr) throw teamsErr;

  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, time, court, team_a_name, team_b_name, score_a, score_b, status, round, schedule_day, is_public",
    )
    .eq("is_public", true);
  if (matchErr) throw matchErr;

  const paidTeams = (teams ?? []).filter((t) => t.payment_status === "PAID") as DbTeam[];
  const publicMatches = (matches ?? []) as DbMatch[];

  return { publicVisible, paidTeams, publicMatches };
}

function formatResultados(division: Division, matches: DbMatch[], teams: DbTeam[]): string {
  const divMatches = matches
    .filter((m) => resolveMatchDivision(m, teams) === division && m.status === "FINISHED")
    .sort((a, b) => {
      const da = DAY_ORDER[inferDay(a)] ?? 99;
      const db = DAY_ORDER[inferDay(b)] ?? 99;
      if (da !== db) return db - da;
      return timeSortKey(b.time) - timeSortKey(a.time);
    })
    .slice(0, 12);

  if (divMatches.length === 0) {
    return `${division}: aún no hay resultados publicados.`;
  }
  const lines = divMatches.map((m) => {
    const day = inferDay(m);
    const dayPart = day ? `${day} ` : "";
    return `${dayPart}${m.time} ${m.court}\n${m.team_a_name} ${scoreLine(m)} ${m.team_b_name}`;
  });
  return [`📊 ${division} — resultados`, ...lines].join("\n\n");
}

function formatClasificacion(division: Division, matches: DbMatch[], teams: DbTeam[]): string {
  const roster = teams.filter((t) => t.division === division);
  const groups = [...new Set(roster.map((t) => (t.competition_group ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  if (groups.length === 0) {
    const table = computeStandings(roster, matches);
    if (table.length === 0) return `${division}: sin equipos inscritos.`;
    const lines = table.map((r, i) =>
      `${i + 1}. ${r.name} — ${r.points} pts (${r.played} PJ, ${r.won} PG)`
    );
    return [`🏆 ${division}`, ...lines].join("\n");
  }

  const blocks: string[] = [`🏆 ${division}`];
  for (const g of groups) {
    const groupRoster = roster.filter((t) => (t.competition_group ?? "").trim() === g);
    const groupMatches = matches.filter((m) => {
      if (resolveMatchDivision(m, teams) !== division) return false;
      const names = new Set(groupRoster.map((t) => t.name));
      return names.has(m.team_a_name) && names.has(m.team_b_name);
    });
    const table = computeStandings(groupRoster, groupMatches);
    blocks.push(`Grupo ${g}:`);
    table.slice(0, 8).forEach((r, i) => {
      blocks.push(`  ${i + 1}. ${r.name} — ${r.points} pts`);
    });
  }
  return blocks.join("\n");
}

function formatSiguiente(teamHint: string, matches: DbMatch[], teams: DbTeam[]): string {
  if (!teamHint.trim()) {
    return 'Indica el equipo. Ejemplo: /siguiente partido Kolosaurios';
  }
  const candidates = teams.filter((t) => normalize(t.name).includes(normalize(teamHint)));
  if (candidates.length === 0) {
    return `No encuentro ningún equipo parecido a "${teamHint}".`;
  }
  const team = candidates.sort((a, b) => a.name.length - b.name.length)[0]!;
  const teamNames = new Set([team.name]);

  const upcoming = matches
    .filter((m) => {
      if (m.status === "FINISHED") return false;
      return teamNames.has(m.team_a_name) || teamNames.has(m.team_b_name);
    })
    .sort((a, b) => {
      const da = DAY_ORDER[inferDay(a)] ?? 99;
      const db = DAY_ORDER[inferDay(b)] ?? 99;
      if (da !== db) return da - db;
      return timeSortKey(a.time) - timeSortKey(b.time);
    });

  if (upcoming.length === 0) {
    return `${team.name}: no hay más partidos programados publicados.`;
  }

  const m = upcoming[0]!;
  const rival = m.team_a_name === team.name ? m.team_b_name : m.team_a_name;
  const day = inferDay(m);
  const phase = (m.round ?? "").split("·").pop()?.trim() ?? "";
  return [
    `📅 Próximo partido — ${team.name}`,
    `${day ? day + " · " : ""}${m.time} · ${m.court}`,
    `${team.name} vs ${rival}`,
    phase ? `Fase: ${phase}` : "",
    m.status === "SCHEDULED" ? "Estado: programado" : `Estado: ${m.status}`,
  ].filter(Boolean).join("\n");
}

async function handleCommand(
  supabase: ReturnType<typeof createClient>,
  cmd: FanCommand,
): Promise<string> {
  if (cmd.type === "help") return helpMessage();

  const { publicVisible, paidTeams, publicMatches } = await fetchPublicData(supabase);
  if (!publicVisible) {
    return "El calendario oficial aún no está publicado. Vuelve a probar más tarde o entra en la web.";
  }
  if (publicMatches.length === 0) {
    return "Aún no hay partidos publicados en la web.";
  }

  if (cmd.type === "siguiente") {
    return formatSiguiente(cmd.hint, publicMatches, paidTeams);
  }

  const divisions = resolveDivisions(cmd.hint);
  if (divisions.length === 0) {
    const label = cmd.type === "resultados" ? "resultados" : "clasificación";
    return `Indica la categoría.\nEjemplo: /${label} senior masculino\n\nCategorías: ${DIVISIONS.join(", ")}`;
  }

  const parts = divisions.map((div) =>
    cmd.type === "resultados"
      ? formatResultados(div, publicMatches, paidTeams)
      : formatClasificacion(div, publicMatches, paidTeams),
  );

  const text = parts.join("\n\n—\n\n");
  return text.length > 3900 ? text.slice(0, 3900) + "\n… (recorta en la web)" : text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing server configuration", handled: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", handled: false }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text } = await req.json();
    const rawText = String(text ?? "").trim();
    const cmd = parseFanCommand(rawText);
    if (!cmd) {
      return new Response(JSON.stringify({ handled: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const message = await handleCommand(supabase, cmd);

    return new Response(JSON.stringify({ handled: true, message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ handled: true, message: `Error al consultar: ${msg}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
