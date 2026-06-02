/**
 * Añade semifinales + final IM al borrador Domingo en calendar_simulations.
 * Uso: npx tsx scratch/patch_sunday_im_semis.ts
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Team, Match, CalendarSimulationsPayload } from '../types';
import {
    patchSundaySimulationDraft,
    buildDivisionMinMatchesFromCategories,
    countInfantilMasculinoSemisInMatches,
    type MuskizSimulatorOptions,
} from '../services/muskizScheduleSimulator';
const CALENDAR_SIMULATIONS_KEY = 'calendar_simulations';

function ensureStableDraftMatchIds(matches: Match[]): Match[] {
    return matches.map((m, i) => ({
        ...m,
        id: m.id && String(m.id).length > 0 ? m.id : `draft_${crypto.randomUUID()}_${i}`,
        isPublic: m.isPublic ?? true,
    }));
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
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error('Faltan VITE_SUPABASE_URL y clave (ANON o SERVICE_ROLE) en .env');
        process.exit(1);
    }

    const supabase = createClient(url, key);

    const { data: teamRows, error: teamErr } = await supabase.from('teams').select('*');
    if (teamErr) {
        console.error('teams:', teamErr.message);
        process.exit(1);
    }
    const teams = (teamRows ?? []).map((t) => mapTeam(t as Record<string, unknown>));

    const { data: cats } = await supabase.from('categories').select('name, min_matches_per_team');
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

    const payload = simRow.value as CalendarSimulationsPayload;
    const sundayIdx = payload.drafts.findIndex((d) => d.scheduleDay === 'Domingo');
    if (sundayIdx < 0) {
        console.error('No hay borrador Domingo');
        process.exit(1);
    }

    const sunday = payload.drafts[sundayIdx]!;
    const beforeSemis = countInfantilMasculinoSemisInMatches(sunday.matches);
    console.log(`Domingo: ${sunday.matches.length} partidos · semis IM antes: ${beforeSemis}`);

    const { matches, changed, notes } = patchSundaySimulationDraft(teams, sunday.matches, options);
    if (!changed) {
        console.log('Sin cambios (ya tiene semifinales IM o no aplica).');
        process.exit(0);
    }

    const afterSemis = countInfantilMasculinoSemisInMatches(matches);
    const normalized = ensureStableDraftMatchIds(matches);
    const nextPayload: CalendarSimulationsPayload = {
        ...payload,
        drafts: payload.drafts.map((d, i) =>
            i === sundayIdx ? { ...d, matches: normalized } : d
        ),
    };

    const { error: saveErr } = await supabase
        .from('site_content')
        .upsert({ key: CALENDAR_SIMULATIONS_KEY, value: nextPayload }, { onConflict: 'key' });

    if (saveErr) {
        console.error('No se pudo guardar:', saveErr.message);
        process.exit(1);
    }

    console.log(`✓ Guardado: ${notes.join(', ')}`);
    console.log(`  Partidos domingo: ${sunday.matches.length} → ${normalized.length}`);
    console.log(`  Semis IM: ${beforeSemis} → ${afterSemis}`);

    const imElim = normalized
        .filter((m) => (m.round ?? '').includes('IM') && /semi|final/i.test(m.round ?? ''))
        .sort((a, b) => a.time.localeCompare(b.time));
    console.log('\nEliminatoria IM:');
    for (const m of imElim) {
        console.log(`  ${m.time} ${m.court}: ${m.teamA} vs ${m.teamB} (${m.round})`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
