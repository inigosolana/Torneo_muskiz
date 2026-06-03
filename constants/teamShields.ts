import sinfinShield from '../assets/escudos/sinfin.png';
import abuelosShield from '../assets/escudos/abuelos.png';
import bitxipareShield from '../assets/escudos/bitxipare.png';
import stoneShield from '../assets/escudos/stone.png';
import urdaibaiShield from '../assets/escudos/urdaibai.png';
import puenteViesgoShield from '../assets/escudos/puente-viesgo.png';
import mekemaShield from '../assets/escudos/mekema.png';
import blcbuShield from '../assets/escudos/blcbu.png';
import thunderShield from '../assets/escudos/thunder.png';
import blueFlowShield from '../assets/escudos/blue-flow.png';

type ShieldMatcher = { test: (normalized: string) => boolean; src: string };

function norm(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}

/** Escudo Kolosaurios (public/, mismo que cabecera web). */
const KOLOSAURIOS_SHIELD = '/logo_kolosaurios.png';

/** Escudos oficiales del torneo (empaquetados en build). */
const TEAM_SHIELD_MATCHERS: ShieldMatcher[] = [
    { test: (n) => /\bkolosaurios?\b/.test(n), src: KOLOSAURIOS_SHIELD },
    { test: (n) => /\bsinfin\b/.test(n), src: sinfinShield },
    { test: (n) => /\babuelos\b/.test(n), src: abuelosShield },
    { test: (n) => /\bbitxipare\b/.test(n) || /\bbitxi\s*pare\b/.test(n), src: bitxipareShield },
    { test: (n) => /\bstone\b/.test(n) || /\bbasauri\s*aristocats\b/.test(n), src: stoneShield },
    { test: (n) => /\bblue\s*flow\b/.test(n), src: blueFlowShield },
    { test: (n) => /\burdaibai\b/.test(n) || /\bblue\s*butterflies\b/.test(n), src: urdaibaiShield },
    {
        test: (n) => /\bpuente\s*viesgo\b/.test(n) || /\bbalonmano\s*puente\b/.test(n),
        src: puenteViesgoShield,
    },
    { test: (n) => /\bmekema\b/.test(n), src: mekemaShield },
    { test: (n) => /\bblcbu\b/.test(n) || /\bbicbu\b/.test(n), src: blcbuShield },
    { test: (n) => /\bthunder\b/.test(n), src: thunderShield },
];

export function resolveBuiltinTeamShield(teamName: string): string | undefined {
    const n = norm(teamName);
    if (!n) return undefined;
    for (const { test, src } of TEAM_SHIELD_MATCHERS) {
        if (test(n)) return src;
    }
    return undefined;
}

/** Escudo para clasificación/resultados: prioriza logo en BD, luego escudo empaquetado. */
export function resolveTeamShield(teamName: string, logoFromDb?: string | null): string | undefined {
    const db = (logoFromDb ?? '').trim();
    if (db && (db.includes('/') || db.includes('.'))) return db;
    return resolveBuiltinTeamShield(teamName);
}
