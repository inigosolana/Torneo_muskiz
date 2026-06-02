import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Team, CalendarSimulationsPayload } from '../types';
import {
    patchSaturdaySimulationDraft,
    buildDivisionMinMatchesFromCategories,
} from '../services/muskizScheduleSimulator';

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
        fee: 0,
        managerName: '',
        managerEmail: '',
        players: [],
    };
}

async function main() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { data: teamRows } = await supabase.from('teams').select('*');
    const teams = (teamRows ?? []).map((t) => mapTeam(t as Record<string, unknown>));
    const { data: cats } = await supabase.from('categories').select('name, min_matches_per_team');
    const opts = { divisionMinMatches: buildDivisionMinMatchesFromCategories(cats ?? []) };

    const { data } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', 'calendar_simulations')
        .maybeSingle();
    const sat = (data?.value as CalendarSimulationsPayload)?.drafts?.find((d) => d.scheduleDay === 'Sábado');
    if (!sat) {
        console.log('No sábado');
        return;
    }

    const { matches, changed, notes } = patchSaturdaySimulationDraft(teams, sat.matches, opts);
    console.log(changed ? `Parche: ${notes.join('; ')}` : 'Sin cambios');

    const sm = matches.filter(
        (m) => (m.round ?? '').includes('SM') && /cuartos|repesca/i.test(m.round ?? '')
    );
    console.log(`\nSM repesca+cuartos: ${sm.length} partidos (debe ser 5)\n`);
    for (const m of sm.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))) {
        console.log(`${m.time} ${m.court}: ${m.teamA} vs ${m.teamB}`);
    }
}

main();
