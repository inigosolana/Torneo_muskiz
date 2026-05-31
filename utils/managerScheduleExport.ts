import * as XLSX from 'xlsx';
import type { Match, Team } from '../types';
import { inferMatchScheduleDay } from '../services/tournamentScheduleService';
import { resolveMatchDivision } from '../services/muskizScheduleSimulator';
import { getMatchSetsDisplay } from '../utils/beachSetScoring';

function phaseLabel(round?: string): string {
    return (round ?? '').split('·').slice(2).join('·').trim() || round || '—';
}

function statusLabel(status: Match['status']): string {
    if (status === 'FINISHED') return 'Finalizado';
    if (status === 'LIVE') return 'En juego';
    return 'Programado';
}

function buildRows(matches: Match[], allTeams: Team[]): Record<string, string>[] {
    return matches.map((m) => ({
        Día: inferMatchScheduleDay(m) ?? '—',
        Hora: m.time,
        Campo: m.court,
        Categoría: resolveMatchDivision(m, allTeams) ?? '—',
        'Equipo A': m.teamA,
        'Equipo B': m.teamB,
        Resultado: getMatchSetsDisplay(m),
        Fase: phaseLabel(m.round),
        Estado: statusLabel(m.status),
    }));
}

export function downloadManagerScheduleExcel(
    matches: Match[],
    allTeams: Team[],
    filenameBase: string
): void {
    const rows = buildRows(matches, allTeams);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
    XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}

export function printManagerSchedulePdf(
    matches: Match[],
    allTeams: Team[],
    title: string,
    subtitle?: string
): void {
    const byDay = new Map<string, Match[]>();
    for (const m of matches) {
        const day = inferMatchScheduleDay(m) ?? 'Sin día';
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(m);
    }

    const daySections = [...byDay.entries()]
        .map(([day, list]) => {
            const rows = list
                .sort((a, b) => a.time.localeCompare(b.time) || a.court.localeCompare(b.court, 'es'))
                .map(
                    (m) => `
                <tr>
                    <td>${m.time}</td>
                    <td>${m.court}</td>
                    <td>${resolveMatchDivision(m, allTeams) ?? '—'}</td>
                    <td><strong>${m.teamA}</strong></td>
                    <td class="score">${getMatchSetsDisplay(m)}</td>
                    <td><strong>${m.teamB}</strong></td>
                    <td>${phaseLabel(m.round)}</td>
                </tr>`
                )
                .join('');
            return `
            <section class="day-block">
                <h2>${day}</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Hora</th><th>Campo</th><th>Categoría</th>
                            <th>Equipo A</th><th>Resultado</th><th>Equipo B</th><th>Fase</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
        })
        .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  h2 { font-size: 14px; background: #0f766e; color: #fff; padding: 8px 12px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
  td.score { text-align: center; font-weight: bold; min-width: 48px; }
  @media print { body { margin: 12px; } .day-block { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
  ${daySections || '<p>Sin partidos.</p>'}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
        alert('Permite ventanas emergentes para descargar el PDF.');
        return;
    }
    w.document.write(html);
    w.document.close();
}
