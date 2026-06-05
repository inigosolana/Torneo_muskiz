import XLSX from 'xlsx-js-style';
import type { Match, Team } from '../types';
import {
    getDayScheduleConfig,
    resolveMatchDivision,
    groupMatchesForDayGrid,
    type MuskizScheduleDayLabel,
} from '../services/muskizScheduleSimulator';
import { inferMatchScheduleDay } from '../services/tournamentScheduleService';
import { getMatchGridColors } from './matchGridColors';
import {
    EXCEL_BORDER_RGB,
    EXCEL_PAUSE_GAP_RGB,
    EXCEL_PAUSE_LUNCH_RGB,
    EXCEL_TIME_COL_RGB,
    tailwindBgToExcelRgb,
} from './tailwindExcelColors';

const SLOT_MINS = 35;

function timeToMinutes(t: string): number {
    if (!t || t === 'PENDIENTE') return 0;
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function lunchPauseSlotTimes(lunch: { start: string; end: string }, slotMins = SLOT_MINS): string[] {
    const out: string[] = [];
    let t = timeToMinutes(lunch.start);
    const end = timeToMinutes(lunch.end);
    while (t + slotMins <= end) {
        out.push(minutesToTime(t));
        t += slotMins;
    }
    return out;
}

function shortPhaseLabel(round?: string): string {
    if (!round) return '';
    const tail = (round.split('·').slice(2).join('·').trim() || round).trim();
    if (/\b(Semi|Final|Cuarto|Repesca|3º|4º|Perd\.)/i.test(tail)) return tail;
    return '';
}

function formatMatchCell(m: Match): string {
    const phase = shortPhaseLabel(m.round);
    const main = `${m.teamA} vs ${m.teamB}`;
    return phase ? `${main}\n${phase}` : main;
}

type DisplayRow =
    | { kind: 'slot'; time: string }
    | { kind: 'pause-gap'; timeLabel: string; detail: string }
    | { kind: 'pause-lunch'; time: string };

function filterTimesForFriday(
    day: MuskizScheduleDayLabel,
    times: string[],
    courts: string[],
    grid: Record<string, Record<string, Match | null>>
): string[] {
    if (day !== 'Viernes') return times;
    return times.filter((t) => {
        if (t === 'PENDIENTE') return true;
        return courts.some((c) => Boolean(grid[t]?.[c]));
    });
}

function buildDisplayRows(
    day: MuskizScheduleDayLabel,
    times: string[],
    courts: string[],
    grid: Record<string, Record<string, Match | null>>,
    lunch?: { start: string; end: string }
): DisplayRow[] {
    const timesToRender = filterTimesForFriday(day, times, courts, grid);
    const rows: DisplayRow[] = [];
    let lunchSlotsInserted = false;

    for (let idx = 0; idx < timesToRender.length; idx++) {
        const t = timesToRender[idx]!;
        if (idx > 0) {
            const prev = timesToRender[idx - 1]!;
            const prevMin = /^\d{2}:\d{2}$/.test(prev) ? timeToMinutes(prev) : null;
            const currMin = /^\d{2}:\d{2}$/.test(t) ? timeToMinutes(t) : null;
            if (prevMin != null && currMin != null) {
                const gap = currMin - prevMin - SLOT_MINS;
                if (gap > 0) {
                    const gapStart = prevMin + SLOT_MINS;
                    const gapEnd = currMin;
                    rows.push({
                        kind: 'pause-gap',
                        timeLabel: 'PAUSA',
                        detail: `Pausa ${gap} min: ${minutesToTime(gapStart)} - ${minutesToTime(gapEnd)}`,
                    });
                }
            }
        }

        if (lunch && !lunchSlotsInserted && t === lunch.end) {
            for (const lt of lunchPauseSlotTimes(lunch)) {
                rows.push({ kind: 'pause-lunch', time: lt });
            }
            lunchSlotsInserted = true;
        }

        rows.push({ kind: 'slot', time: t });
    }

    return rows;
}

function cellStyle(
    fillRgb: string,
    opts?: { bold?: boolean; fontColor?: string; fontSize?: number; wrap?: boolean }
): XLSX.CellObject['s'] {
    return {
        fill: { fgColor: { rgb: fillRgb } },
        alignment: {
            vertical: 'center',
            horizontal: 'center',
            wrapText: opts?.wrap ?? true,
        },
        font: {
            sz: opts?.fontSize ?? 10,
            bold: opts?.bold ?? false,
            color: opts?.fontColor ? { rgb: opts.fontColor } : undefined,
        },
        border: {
            top: { style: 'thin', color: { rgb: EXCEL_BORDER_RGB } },
            bottom: { style: 'thin', color: { rgb: EXCEL_BORDER_RGB } },
            left: { style: 'thin', color: { rgb: EXCEL_BORDER_RGB } },
            right: { style: 'thin', color: { rgb: EXCEL_BORDER_RGB } },
        },
    };
}

function setCell(
    ws: XLSX.WorkSheet,
    r: number,
    c: number,
    value: string,
    style: XLSX.CellObject['s']
): void {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = { t: 's', v: value, s: style };
}

export function downloadTournamentGridExcel(
    day: MuskizScheduleDayLabel,
    matches: Match[],
    filenameBase: string
): void {
    const { courts, times, grid } = groupMatchesForDayGrid(matches, day, { fillEmptySlots: true });
    const dayCfg = getDayScheduleConfig(day);
    const displayRows = buildDisplayRows(day, times, courts, grid, dayCfg.lunch);

    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    let r = 0;

    setCell(ws, r, 0, day, cellStyle('0F766E', { bold: true, fontColor: 'FFFFFF', fontSize: 12, wrap: false }));
    for (let c = 1; c <= courts.length; c++) {
        setCell(ws, r, c, c <= courts.length ? courts[c - 1]! : '', cellStyle('0F766E', { bold: true, fontColor: 'FFFFFF', wrap: false }));
    }
    r++;

    for (const row of displayRows) {
        if (row.kind === 'pause-gap') {
            setCell(ws, r, 0, row.timeLabel, cellStyle(EXCEL_PAUSE_GAP_RGB, { bold: true }));
            setCell(ws, r, 1, row.detail, cellStyle(EXCEL_PAUSE_GAP_RGB, { bold: true, fontSize: 9 }));
            if (courts.length > 1) {
                merges.push({ s: { r, c: 1 }, e: { r, c: courts.length } });
            }
            r++;
            continue;
        }

        if (row.kind === 'pause-lunch') {
            setCell(ws, r, 0, row.time, cellStyle(EXCEL_PAUSE_LUNCH_RGB, { bold: true, fontColor: 'FFFFFF' }));
            setCell(ws, r, 1, 'PAUSA', cellStyle(EXCEL_PAUSE_LUNCH_RGB, { bold: true, fontColor: 'FFFFFF', fontSize: 11 }));
            if (courts.length > 1) {
                merges.push({ s: { r, c: 1 }, e: { r, c: courts.length } });
            }
            r++;
            continue;
        }

        const t = row.time;
        setCell(
            ws,
            r,
            0,
            t,
            cellStyle(t === 'PENDIENTE' ? 'FEF3C7' : EXCEL_TIME_COL_RGB, { bold: true, wrap: false })
        );

        courts.forEach((court, ci) => {
            const m = grid[t]?.[court] ?? null;
            const col = ci + 1;
            if (!m) {
                setCell(ws, r, col, '', cellStyle('FFFFFF', { wrap: false }));
                return;
            }
            const colors = getMatchGridColors(m.round);
            setCell(ws, r, col, formatMatchCell(m), cellStyle(tailwindBgToExcelRgb(colors.cell), { fontSize: 9 }));
        });
        r++;
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, r - 1), c: courts.length } });
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 9 }, ...courts.map(() => ({ wch: 24 }))];
    ws['!rows'] = Array.from({ length: r }, () => ({ hpt: 42 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, day.slice(0, 10));
    XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}

function tailwindBgToCss(cellClass: string): string {
    const hex = tailwindBgToExcelRgb(cellClass);
    return `#${hex}`;
}

export function printTournamentGridPdf(
    day: MuskizScheduleDayLabel,
    matches: Match[],
    title: string,
    subtitle?: string
): void {
    const { courts, times, grid } = groupMatchesForDayGrid(matches, day, { fillEmptySlots: true });
    const dayCfg = getDayScheduleConfig(day);
    const displayRows = buildDisplayRows(day, times, courts, grid, dayCfg.lunch);

    const bodyRows = displayRows
        .map((row) => {
            if (row.kind === 'pause-gap') {
                return `<tr class="pause-gap">
          <td class="time pause">PAUSA</td>
          <td colspan="${courts.length}" class="pause-cell">${row.detail}</td>
        </tr>`;
            }
            if (row.kind === 'pause-lunch') {
                return `<tr class="pause-lunch">
          <td class="time pause-lunch">${row.time}</td>
          <td colspan="${courts.length}" class="pause-lunch-cell">PAUSA</td>
        </tr>`;
            }
            const t = row.time;
            const cells = courts
                .map((c) => {
                    const m = grid[t]?.[c] ?? null;
                    if (!m) return `<td class="empty"></td>`;
                    const colors = getMatchGridColors(m.round);
                    const bg = tailwindBgToCss(colors.cell);
                    return `<td style="background:${bg}"><div class="match">${formatMatchCell(m).replace(/\n/g, '<br/>')}</div></td>`;
                })
                .join('');
            return `<tr><td class="time">${t}</td>${cells}</tr>`;
        })
        .join('');

    const courtHeaders = courts.map((c) => `<th>${c}</th>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 16px; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 11px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
  th, td { border: 1px solid #cbd5e1; padding: 4px; vertical-align: middle; text-align: center; }
  th { background: #0f766e; color: #fff; font-size: 8px; }
  td.time { background: #f1f5f9; font-weight: bold; width: 52px; font-family: Consolas, monospace; }
  td.empty { background: #fff; min-height: 36px; }
  td.pause-cell, tr.pause-gap td.time.pause { background: #fef3c7; font-weight: bold; }
  tr.pause-lunch td { background: #1e3a8a; color: #fff; font-weight: bold; }
  .match { line-height: 1.25; word-wrap: break-word; }
  @media print { body { margin: 8px; } tr { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
  <table>
    <thead><tr><th>Hora</th>${courtHeaders}</tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="' + (courts.length + 1) + '">Sin partidos</td></tr>'}</tbody>
  </table>
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

const DAY_SORT_ORDER: Record<MuskizScheduleDayLabel, number> = {
    Viernes: 1,
    Sábado: 2,
    Domingo: 3,
};

function sanitizeSheetName(name: string): string {
    return name.replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Hoja';
}

function sortByTimeAndTeams(a: Match, b: Match): number {
    if (a.time === 'PENDIENTE' && b.time !== 'PENDIENTE') return 1;
    if (a.time !== 'PENDIENTE' && b.time === 'PENDIENTE') return -1;
    if (a.time !== b.time) return a.time.localeCompare(b.time, 'es');
    return `${a.teamA} vs ${a.teamB}`.localeCompare(`${b.teamA} vs ${b.teamB}`, 'es');
}

export function downloadCourtSheetsExcel(
    matches: Match[],
    teams: Team[],
    filenameBase = 'calendario_anotadores'
): void {
    const wb = XLSX.utils.book_new();

    const grouped = new Map<string, { day: MuskizScheduleDayLabel; court: string; list: Match[] }>();
    for (const match of matches) {
        const day = inferMatchScheduleDay(match);
        if (!day) continue;
        const court = (match.court || 'Sin campo').trim();
        const key = `${day}__${court}`;
        if (!grouped.has(key)) grouped.set(key, { day, court, list: [] });
        grouped.get(key)!.list.push(match);
    }

    const groups = [...grouped.values()].sort((a, b) => {
        const dayOrder = DAY_SORT_ORDER[a.day] - DAY_SORT_ORDER[b.day];
        if (dayOrder !== 0) return dayOrder;
        return a.court.localeCompare(b.court, 'es');
    });

    if (groups.length === 0) {
        const ws = XLSX.utils.json_to_sheet(
            [{ Horario: '', Categoría: '', Equipos: 'Sin partidos con día/campo asignado', Resultado: '' }],
            { header: ['Horario', 'Categoría', 'Equipos', 'Resultado'] }
        );
        ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 52 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Sin_partidos');
        XLSX.writeFile(wb, `${filenameBase}.xlsx`);
        return;
    }

    for (const group of groups) {
        const rows = [...group.list].sort(sortByTimeAndTeams).map((m) => ({
            Horario: m.time,
            Categoría: resolveMatchDivision(m, teams) ?? '—',
            Equipos: `${m.teamA} vs ${m.teamB}`,
            Resultado: '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { header: ['Horario', 'Categoría', 'Equipos', 'Resultado'] });
        ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 52 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`${group.day}-${group.court}`));
    }

    XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}
