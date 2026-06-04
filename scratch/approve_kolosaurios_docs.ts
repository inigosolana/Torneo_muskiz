/**
 * Aprueba DNI y seguro de toda la plantilla en equipos Kolosaurios / Kolosaurias.
 * Uso: npx tsx scratch/approve_kolosaurios_docs.ts
 * Requiere SUPABASE_SERVICE_ROLE_KEY (o ANON si RLS lo permite) en .env / .env.local
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.VITE_SUPABASE_URL?.trim();
const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
    console.error('Faltan VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (recomendado) o ANON_KEY');
    process.exit(1);
}

const supabase = createClient(url, key);

function isKolosauriosTeam(name: string, city?: string | null): boolean {
    const blob = `${name} ${city ?? ''}`.toLowerCase();
    return /kolosauri[oa]/.test(blob);
}

async function main() {
    const { data: teams, error: teamsErr } = await supabase.from('teams').select('id, name, division, city');
    if (teamsErr) throw teamsErr;

    const kTeams = (teams ?? []).filter((t) => isKolosauriosTeam(t.name, t.city));
    if (kTeams.length === 0) {
        console.log('No se encontraron equipos Kolosaurios/Kolosaurias.');
        return;
    }

    console.log('Equipos Kolosaurios:');
    for (const t of kTeams) console.log(`  - ${t.name} (${t.division}) [${t.id}]`);

    const teamIds = kTeams.map((t) => t.id);
    const { data: players, error: plErr } = await supabase
        .from('players')
        .select('id, name, surnames, role, team_id, dni_status, insurance_status')
        .in('team_id', teamIds);
    if (plErr) throw plErr;

    const roster = players ?? [];
    console.log(`\nJugadoras/os en plantilla: ${roster.length}`);

    let updated = 0;
    for (const p of roster) {
        const isPlayer = p.role === 'PLAYER';
        const patch: { dni_status: string; insurance_status?: string } = {
            dni_status: 'APPROVED',
        };
        if (isPlayer) patch.insurance_status = 'APPROVED';

        const needsDni = p.dni_status !== 'APPROVED';
        const needsIns = isPlayer && p.insurance_status !== 'APPROVED';
        if (!needsDni && !needsIns) continue;

        const { error } = await supabase.from('players').update(patch).eq('id', p.id);
        if (error) {
            console.error(`Error ${p.name} ${p.surnames ?? ''}:`, error.message);
            continue;
        }
        updated++;
        console.log(
            `  OK ${p.name} ${p.surnames ?? ''} (${p.role}) DNI:${p.dni_status}->APPROVED` +
                (isPlayer ? ` SEG:${p.insurance_status}->APPROVED` : ''),
        );
    }

    console.log(`\nActualizados: ${updated} de ${roster.length}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
