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
import astilleroBluesShield from '../assets/escudos/astillero-blues.png';
import roseCamargoShield from '../assets/escudos/rose-camargo.png';
import arangoitiIkastolaShield from '../assets/escudos/arangoiti-ikastola.png';
import calasancioShield from '../assets/escudos/calasancio.png';

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
    { test: (n) => /\bkolosauri[oa]s?\b/.test(n), src: KOLOSAURIOS_SHIELD },
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
    {
        test: (n) =>
            /\barangoiti\b/.test(n) ||
            /\barangoiti\s*ikastola\b/.test(n) ||
            /\bikastola\s*arangoiti\b/.test(n),
        src: arangoitiIkastolaShield,
    },
    {
        test: (n) =>
            /\bcalasancio\b/.test(n) ||
            /\bclarasancio\b/.test(n) ||
            /\bc\.?\s*p\.?\s*calasancio\b/.test(n),
        src: calasancioShield,
    },
    {
        test: (n) =>
            /\brose\s*camargo\b/.test(n) ||
            /\brosé\s*camargo\b/.test(n) ||
            (/\bcamargo\b/.test(n) && /\brose\b/.test(n)) ||
            /\brose\s*camargo\s*beach\b/.test(n) ||
            /\brosé\s*camargo\s*beach\b/.test(n) ||
            /\brose\s*de\s*sf\b/.test(n) ||
            /\brose\s*beach\b/.test(n) ||
            /\brosé\s*beach\b/.test(n),
        src: roseCamargoShield,
    },
    {
        test: (n) =>
            /\bastillero\s*blues\b/.test(n) ||
            /\bblues\s*astillero\b/.test(n) ||
            /\bs\.?\s*d\.?\s*c\.?\s*astillero\b/.test(n) ||
            /\bastillero\b/.test(n),
        src: astilleroBluesShield,
    },
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
