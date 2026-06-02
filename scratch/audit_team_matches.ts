/**
 * Cuenta partidos de un equipo en borrador sábado y formato previsto.
 * Uso: npx tsx scratch/audit_team_matches.ts Mekema
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Team, Match, CalendarSimulationsPayload } from '../types';
import {
    countMatchesPerTeamForDivision,
    buildDivisionMinMatchesFromCategories,
    divisionBelongsToScheduleDay,
    resolveMinMatchesForDivision,
    type MuskizSimulatorOptions,
} from '../services/muskizScheduleSimulator';

dotenv.config();

const CALENDAR_SIMULATIONS_KEY = 'calendar_simulations';

function normalize(s: string): string {
    return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function saturdayMatchesFromPayload(payload: CalendarSimulationsPayload): Match[] {
    const saturday = payload.drafts.find((d) => d.scheduleDay === 'Sábado');
    if (saturday) return saturday.matches;
    const merged: Match[] = [];
    for (const d of payload.drafts) {
        for (const m of d.matches) {
            const p = (m.round ?? '').slice(0, 3).toLowerCase();
            if (p === 'sab' || m.scheduleDay === 'Sábado') merged.push(m);
        }
    }
    return merged;
}

function mapTeam(t: Record<string, unknown>): Team {
    return {
        id: String(t.id),
        name: String(t.name),
        city: String(t.city ?? ''),
        division: t.division as Team['division'],
        paymentStatus: t.payment_status as Team['paymentStatus'],
        competitionGroup: (t.competition_group as string | null) ?? null,
        status: (t.status as Team['status']) || 'approved',
        fee: Number(t.fee ?? 0),
        managerName: String(t.manager_name ?? ''),
        managerEmail: String(t.manager_email ?? ''),
        players: [],
    };
}

async function main() {
    const query = process.argv[2] ?? 'Mekema';
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
        process.exit(1);
    }

    const supabase = createClient(url, key);
    const { data: teamRows } = await supabase.from('teams').select('*');
    const teams = (teamRows ?? []).map((t) => mapTeam(t as Record<string, unknown>));

    const q = normalize(query);
    const hits = teams.filter((t) => normalize(t.name).includes(q) || normalize(t.city).includes(q));
    if (hits.length === 0) {
        console.error(`No se encontró equipo con "${query}"`);
        process.exit(1);
    }

    const { data: cats } = await supabase.from('categories').select('name, min_matches_per_team');
    const options: MuskizSimulatorOptions = {
        divisionMinMatches: buildDivisionMinMatchesFromCategories(cats ?? []),
    };

    const { data: simRow } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', CALENDAR_SIMULATIONS_KEY)
        .maybeSingle();

    const saturdayMatches = simRow?.value
        ? saturdayMatchesFromPayload(simRow.value as CalendarSimulationsPayload)
        : [];

    const { data: officialMatches } = await supabase
        .from('matches')
        .select('teamA, teamB, time, court, round, schedule_day')
        .or(`teamA.ilike.%${query}%,teamB.ilike.%${query}%`);

    for (const team of hits) {
        const label = normalize(team.name);
        const divRoster = teams.filter((t) => t.division === team.division && t.paymentStatus === 'PAID');
        const planned = countMatchesPerTeamForDivision(divRoster, options).find(
            (r) => normalize(r.name) === label
        );

        const sat = saturdayMatches.filter(
            (m) => normalize(m.teamA) === label || normalize(m.teamB) === label
        );

        const official = (officialMatches ?? []).filter(
            (m: { teamA: string; teamB: string }) =>
                normalize(m.teamA) === label || normalize(m.teamB) === label
        );

        const minDiv = resolveMinMatchesForDivision(team.division, options);

        console.log(`\n=== ${team.name} ===`);
        console.log(`Categoría: ${team.division}`);
        console.log(`Grupo: ${team.competitionGroup ?? '(auto)'}`);
        console.log(`Pago: ${team.paymentStatus}`);
        console.log(`Mínimo configurado categoría: ${minDiv} partidos`);
        console.log(`Previsto formato completo (con extras mín.): ${planned?.matches ?? '—'} partidos`);
        console.log(`Borrador SÁBADO (simulación): ${sat.length} partidos`);
        if (sat.length) {
            for (const m of sat.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))) {
                const opp = normalize(m.teamA) === label ? m.teamB : m.teamA;
                const phase = (m.round ?? '').split('·').slice(2).join('·').trim() || m.round;
                console.log(`  - ${m.time} ${m.court}: vs ${opp} (${phase})`);
            }
        }
        console.log(`Calendario oficial (BD): ${official.length} partidos`);
        if (official.length) {
            for (const m of official) {
                const opp = normalize(m.teamA) === label ? m.teamB : m.teamA;
                console.log(`  - ${m.time} ${m.court}: vs ${opp} (${m.round ?? ''})`);
            }
        }
        if (divisionBelongsToScheduleDay(team.division, 'Sábado')) {
            console.log(`Día asignado: Sábado`);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
