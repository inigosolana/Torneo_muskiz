/**
 * Audita fase de grupos del borrador Sábado vs configuración actual (equipos pagados + grupos).
 * Uso: npx tsx scratch/audit_saturday_groups.ts
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Team, Match, CalendarDraft, CalendarSimulationsPayload } from '../types';
import {
    auditSaturdayGroupPhase,
    buildDivisionMinMatchesFromCategories,
    type MuskizSimulatorOptions,
} from '../services/muskizScheduleSimulator';

const CALENDAR_SIMULATIONS_KEY = 'calendar_simulations';

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

dotenv.config();

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
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
        process.exit(1);
    }

    const supabase = createClient(url, key);

    const { data: teamRows, error: teamErr } = await supabase.from('teams').select('*');
    if (teamErr) {
        console.error('teams:', teamErr.message);
        process.exit(1);
    }
    const teams = (teamRows ?? []).map((t) => mapTeam(t as Record<string, unknown>));

    const { data: cats, error: catErr } = await supabase
        .from('categories')
        .select('name, min_matches_per_team');
    if (catErr) console.warn('categories:', catErr.message);

    const options: MuskizSimulatorOptions = {
        divisionMinMatches: buildDivisionMinMatchesFromCategories(cats ?? []),
    };

    const { data: simRow, error: simErr } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', CALENDAR_SIMULATIONS_KEY)
        .maybeSingle();
    if (simErr || !simRow?.value) {
        console.error('calendar_simulations:', simErr?.message ?? 'sin datos');
        process.exit(1);
    }

    const saturdayMatches = saturdayMatchesFromPayload(simRow.value as CalendarSimulationsPayload);
    if (saturdayMatches.length === 0) {
        console.error('Borrador Sábado sin partidos');
        process.exit(1);
    }

    const audit = auditSaturdayGroupPhase(teams, saturdayMatches, options);

    console.log('\n=== AUDITORÍA FASE DE GRUPOS · SÁBADO ===\n');
    console.log(audit.summary);
    console.log(audit.complete ? '\n✓ Todos los grupos cuadran.\n' : '\n✗ Hay discrepancias:\n');

    for (const d of audit.divisions) {
        console.log(`--- ${d.division} (${d.paidTeams} equipos pagados) ---`);
        for (const g of d.groups) {
            const status = g.ok ? 'OK' : 'REVISAR';
            console.log(
                `  ${g.groupLabel} [${status}]: ${g.inDraft}/${g.expected} partidos · equipos (${g.teamCount}): ${g.teams.join(', ')}`
            );
            if (g.missing.length) {
                for (const m of g.missing) console.log(`    FALTA: ${m}`);
            }
            if (g.surplus.length) {
                for (const s of g.surplus) console.log(`    SOBRA: ${s}`);
            }
        }
        console.log('');
    }

    process.exit(audit.complete ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
