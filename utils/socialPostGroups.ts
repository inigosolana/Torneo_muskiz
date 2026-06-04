import type { Team } from '../types';
import { resolveTeamShield } from '../constants/teamShields';
import { flagEmojiForTeam, type GroupBlock } from './renderGroupsCanvas';

export function buildPaidGroupsForDivision(teams: Team[], division: Team['division']): GroupBlock[] {
    const map = new Map<string, GroupBlock>();
    for (const t of teams) {
        if (t.division !== division || t.paymentStatus !== 'PAID') continue;
        if (t.status && t.status !== 'approved') continue;
        const key = (t.competitionGroup ?? '').trim();
        if (!key) continue;
        if (!map.has(key)) map.set(key, { key, teams: [] });
        map.get(key)!.teams.push({
            name: t.name,
            shieldUrl: resolveTeamShield(t.name, t.logoUrl),
            flag: flagEmojiForTeam(t.city ?? ''),
        });
    }
    return [...map.values()]
        .sort((a, b) => a.key.localeCompare(b.key, 'es'))
        .map((g) => ({
            ...g,
            teams: g.teams.sort((a, b) => a.name.localeCompare(b.name, 'es')),
        }));
}

export function captionForGroupPost(
    tournamentName: string,
    division: string,
    group: GroupBlock,
): string {
    return [
        `🏐 ${tournamentName}`,
        `📋 ${division} · Grupo ${group.key}`,
        '',
        group.teams.map((t) => `• ${t.name}`).join('\n'),
        '',
        '#TorneoMuskiz #BalonmanoPlaya #Muskiz',
    ].join('\n');
}
