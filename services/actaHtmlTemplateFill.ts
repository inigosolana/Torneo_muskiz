import type { ActaExportContext, ActaPlayerLine } from '../utils/actaBuildContext';

export const ACTA_HTML_TEMPLATE_URL = '/templates/actaplaya_kolosaurios.html';

/** Filas de jugador en la plantilla base (Infantil–Juvenil pueden tener hasta 14 inscritos). */
export const ACTA_TEMPLATE_BASE_PLAYER_ROWS = 12;

/** Filas totales de la tabla en la plantilla HTML sin jugadores extra. */
const ACTA_TEMPLATE_BASE_TABLE_ROWS = 58;

const ROW = {
    COMPETITION_VALUES: 2,
    MATCH_VALUES: 5,
    TEAM_NAMES: 8,
    TEAM_A_PLAYER_FIRST: 12,
    TEAM_B_PLAYER_FIRST: 31,
    TEAM_A_ENT: 24,
    TEAM_A_OF: 25,
    TEAM_A_STAFF_SPARE: 26,
    TEAM_A_RESPONSABLE: 27,
    TEAM_B_ENT: 43,
    TEAM_B_OF: 44,
    TEAM_B_STAFF_SPARE: 45,
    TEAM_B_RESPONSABLE: 46,
} as const;

type ActaCellKind = 'meta' | 'team' | 'name' | 'number';

const ACTA_CELL_LIMITS: Record<ActaCellKind, number> = {
    meta: 48,
    team: 52,
    name: 42,
    number: 3,
};

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fontPt(text: string, kind: ActaCellKind): number {
    const len = text.length;
    if (kind === 'number') return 8;
    if (kind === 'team') {
        if (len > 35) return 9;
        if (len > 25) return 10;
        if (len > 18) return 11;
        return 12;
    }
    if (kind === 'name') {
        if (len > 36) return 5;
        if (len > 28) return 5.5;
        if (len > 22) return 6;
        if (len > 16) return 6.5;
        return 7;
    }
    if (len > 36) return 5.5;
    if (len > 26) return 6;
    if (len > 18) return 6.5;
    return 7.5;
}

function fitCellText(text: string, kind: ActaCellKind): string {
    const trimmed = text.trim();
    const max = ACTA_CELL_LIMITS[kind];
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1)}…`;
}

function splitRowCells(rowHtml: string): { cells: string[]; starts: number[]; ends: number[] } {
    const cells: string[] = [];
    const starts: number[] = [];
    const ends: number[] = [];
    let pos = 0;
    while (pos < rowHtml.length) {
        const start = rowHtml.indexOf('<td', pos);
        if (start < 0) break;
        const end = rowHtml.indexOf('</td>', start);
        if (end < 0) break;
        starts.push(start);
        ends.push(end + 5);
        cells.push(rowHtml.slice(start, end + 5));
        pos = end + 5;
    }
    return { cells, starts, ends };
}

function setCellContent(
    tdHtml: string,
    text: string,
    opts?: { center?: boolean; kind?: ActaCellKind },
): string {
    if (!text) return tdHtml;
    const kind = opts?.kind ?? 'meta';
    const fitted = fitCellText(text, kind);
    const safe = escapeHtml(fitted);
    const pt = fontPt(fitted, kind);
    const align = opts?.center ? 'center' : 'left';
    const inner =
        kind === 'team'
            ? `<p class="c22 acta-team-name" style="text-align:${align};margin:0;padding:0 2pt 5pt;line-height:1;height:auto"><span class="c0" style="font-size:${pt}pt;color:#000000;font-family:Arial,sans-serif;line-height:1;display:block;position:relative;top:-3px">${safe}</span></p>`
            : `<p class="c22" style="text-align:${align};margin:0;padding:0;line-height:0.92"><span class="c0" style="font-size:${pt}pt;color:#000000;font-family:Arial,sans-serif;line-height:0.92;vertical-align:top">${safe}</span></p>`;
    return tdHtml.replace(/<td([^>]*)>[\s\S]*<\/td>/, (_match, attrs: string) => {
        const tdAttrs =
            kind === 'team' && attrs.includes('class="')
                ? attrs.replace(/class="([^"]*)"/, 'class="$1 acta-team-cell"')
                : kind === 'team'
                  ? `${attrs} class="acta-team-cell"`
                  : attrs;
        return `<td${tdAttrs}>${inner}</td>`;
    });
}

function setPlayerRowCells(rowHtml: string, number: string, name: string): string {
    const { cells, starts, ends } = splitRowCells(rowHtml);
    let out = rowHtml;
    const patches: [number, string, { center?: boolean; kind: ActaCellKind }][] = [
        [1, name, { kind: 'name' }],
        [0, number, { center: true, kind: 'number' }],
    ];
    for (const [col, patchText, cellOpts] of patches) {
        if (col >= cells.length || !patchText) continue;
        const updated = setCellContent(cells[col]!, patchText, cellOpts);
        out = out.slice(0, starts[col]!) + updated + out.slice(ends[col]!);
    }
    return out;
}

function setRowCellTexts(
    rowHtml: string,
    assignments: Record<number, { text: string; kind?: ActaCellKind; center?: boolean } | string>,
): string {
    const { cells, starts, ends } = splitRowCells(rowHtml);
    let out = rowHtml;
    const ordered = Object.entries(assignments)
        .map(([k, v]) => {
            if (typeof v === 'string') return [Number(k), { text: v, kind: 'meta' as const }] as const;
            return [Number(k), v] as const;
        })
        .sort((a, b) => b[0] - a[0]);
    for (const [col, { text, kind, center }] of ordered) {
        if (col < 0 || col >= cells.length || !text) continue;
        const updated = setCellContent(cells[col]!, text, { kind: kind ?? 'meta', center });
        out = out.slice(0, starts[col]) + updated + out.slice(ends[col]!);
    }
    return out;
}

function splitTableRows(tableInner: string): string[] {
    return [...tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]!);
}

function joinTableRows(rows: string[]): string {
    return rows.map((r) => `<tr>${r}</tr>`).join('');
}

function blankPlayerRow(rowHtml: string): string {
    return setPlayerRowCells(rowHtml, '', '');
}

/** Inserta filas clonadas si hay más jugadores inscritos que huecos en la plantilla. */
function ensurePlayerRowSlots(
    rows: string[],
    firstRowIdx: number,
    staffRowIdx: number,
    playerCount: number,
): number {
    const slots = staffRowIdx - firstRowIdx;
    if (playerCount <= slots) return staffRowIdx;
    const templateRow = rows[staffRowIdx - 1] ?? rows[firstRowIdx];
    if (!templateRow) return staffRowIdx;
    const toInsert = playerCount - slots;
    for (let i = 0; i < toInsert; i++) {
        rows.splice(staffRowIdx, 0, blankPlayerRow(templateRow));
        staffRowIdx++;
    }
    return staffRowIdx;
}

function teamDisplayName(block: ActaExportContext['teamA']): string {
    return (block.name ?? '').trim();
}

function fillTitle(html: string, title: string): string {
    const safe = escapeHtml(title);
    return html.replace(/II MUSKIZKO UDALA BALONMANO PLAYA/g, safe);
}

function fixTemplateAssetPaths(html: string): string {
    return html
        .replace(/src="images\//g, 'src="/templates/images/')
        .replace(/src="\/templates\/templates\/images\//g, 'src="/templates/images/');
}

/** Cabecera oficial: escudo Muskiz, Muskiz Kirola y Kolosaurios (plantilla Kolosaurios). */
function fixActaHeaderLogos(html: string): string {
    let out = html.replace(
        /<span style="overflow: hidden; display: inline-block;[^"]*">\s*<img alt="" src="\/templates\/images\/image3\.png"[^>]*>\s*<\/span>/g,
        '',
    );
    out = out.replace(
        /(<img alt="" src="\/templates\/images\/[^"]+")/g,
        '$1 crossorigin="anonymous"',
    );
    return out;
}

/** Etiquetas oficiales del acta: local / visitante (en lugar de organizador). */
function applyLocalVisitorLabels(html: string): string {
    return html
        .replace(/COMPONENTES EQUIPO ORGANIZADOR \(A\)/g, 'COMPONENTES EQUIPO LOCAL (A)')
        .replace(/EQUIPO ORGANIZADOR/g, 'EQUIPO LOCAL')
        .replace(/Responsable de equipo A/g, 'Responsable equipo local')
        .replace(/Responsable de equipo B/g, 'Responsable equipo visitante');
}

function countExtraPlayerRows(playersA: number, playersB: number): number {
    return (
        Math.max(0, playersA - ACTA_TEMPLATE_BASE_PLAYER_ROWS) +
        Math.max(0, playersB - ACTA_TEMPLATE_BASE_PLAYER_ROWS)
    );
}

/** Altura imprimible A4 en Chromium (margen bajo ~1100px para evitar salto de página). */
const ACTA_A4_USABLE_PX = 1095;
const ACTA_FILLED_BASE_PX = 1278;
const ACTA_PX_PER_EXTRA_ROW = 22;

/** Escala vertical para que el acta quepa siempre en 1 hoja A4 al imprimir. */
export function actaSinglePageZoom(playersA: number, playersB: number): number {
    const extraRows = countExtraPlayerRows(playersA, playersB);
    if (extraRows <= 0) return 1;
    const estimatedPx = ACTA_FILLED_BASE_PX + extraRows * ACTA_PX_PER_EXTRA_ROW;
    return Math.min(1, (ACTA_A4_USABLE_PX / estimatedPx) * 0.998);
}

function injectSinglePagePrintStyles(html: string, zoom: number): string {
    const printBase = `<style id="acta-print-base">
@page{size:A4 portrait;margin:0}
html{margin:0 auto;padding:0;width:210mm;background:#fff}
body{margin:0 auto;padding:0;width:210mm;box-sizing:border-box;background:#fff}
body.doc-content>div{width:210mm;margin:0 auto}
p.c267{text-align:center!important;margin:0 auto!important;padding:2pt 0!important;line-height:1.2!important}
p.c267 img{display:inline-block!important;vertical-align:middle!important;object-fit:contain!important}
table{margin:0 auto;width:100%}
td.acta-team-cell{vertical-align:middle!important}
p.acta-team-name{height:auto!important;max-height:none!important;line-height:1!important;padding-bottom:5pt!important}
p.acta-team-name span{position:relative!important;top:-3px!important;line-height:1!important;display:block!important}
@media print{
html,body{width:210mm;margin:0 auto}
}
</style>`;
    let out = html.includes('</head>') ? html.replace('</head>', `${printBase}</head>`) : `${printBase}${html}`;

    if (zoom >= 0.999) return out;

    const zoomStr = zoom.toFixed(4);
    const compact = `<style id="acta-single-page">
body.acta-compact{zoom:${zoomStr};transform-origin:center center}
body.acta-compact table td p{line-height:0.92!important;margin:0!important}
@media print{
body.acta-compact{zoom:${zoomStr}}
}
</style>`;
    out = out.replace('</head>', `${compact}</head>`);
    return out.replace('<body class="', '<body class="acta-compact ');
}

function clearFirstCell(rowHtml: string): string {
    const { cells, starts, ends } = splitRowCells(rowHtml);
    if (!cells.length) return rowHtml;
    const cleared = cells[0]!.replace(
        /<td([^>]*)>[\s\S]*<\/td>/,
        `<td$1><p class="c22"><span class="c0"></span></p></td>`,
    );
    return rowHtml.slice(0, starts[0]!) + cleared + rowHtml.slice(ends[0]!);
}

function applyStaffLabels(
    rows: string[],
    staffAIdx: number,
    staffBIdx: number,
): void {
    if (rows[staffAIdx]) {
        rows[staffAIdx] = setRowCellTexts(rows[staffAIdx]!, {
            0: { text: 'ENT', kind: 'meta', center: true },
        });
    }
    if (rows[staffAIdx + 1]) {
        rows[staffAIdx + 1] = setRowCellTexts(rows[staffAIdx + 1]!, {
            0: { text: 'OF', kind: 'meta', center: true },
        });
    }
    if (rows[staffAIdx + 2]) {
        rows[staffAIdx + 2] = clearFirstCell(rows[staffAIdx + 2]!);
    }
    if (rows[staffBIdx]) {
        rows[staffBIdx] = setRowCellTexts(rows[staffBIdx]!, {
            0: { text: 'ENT', kind: 'meta', center: true },
        });
    }
    if (rows[staffBIdx + 1]) {
        rows[staffBIdx + 1] = setRowCellTexts(rows[staffBIdx + 1]!, {
            0: { text: 'OF', kind: 'meta', center: true },
        });
    }
    if (rows[staffBIdx + 2]) {
        rows[staffBIdx + 2] = clearFirstCell(rows[staffBIdx + 2]!);
    }
    if (rows[staffBIdx + 3]) {
        rows[staffBIdx + 3] = setRowCellTexts(rows[staffBIdx + 3]!, {
            0: { text: 'Responsable equipo visitante', kind: 'meta' },
        });
    }
}

function fillTable(html: string, ctx: ActaExportContext): string {
    const tableStart = html.indexOf('<table');
    if (tableStart < 0) throw new Error('Plantilla HTML acta: no se encontró la tabla.');
    const tableOpenEnd = html.indexOf('>', tableStart) + 1;
    const tableClose = html.indexOf('</table>', tableStart);
    if (tableClose < 0) throw new Error('Plantilla HTML acta: tabla sin cierre.');

    const before = html.slice(0, tableOpenEnd);
    const tableInner = html.slice(tableOpenEnd, tableClose);
    const after = html.slice(tableClose);

    const rows = splitTableRows(tableInner);

    rows[ROW.COMPETITION_VALUES] = setRowCellTexts(rows[ROW.COMPETITION_VALUES]!, {
        0: { text: ctx.competitionName, kind: 'meta' },
        1: { text: ctx.category, kind: 'meta' },
        2: { text: ctx.gender, kind: 'meta' },
        3: { text: ctx.phase, kind: 'meta' },
        4: { text: ctx.group, kind: 'meta', center: true },
    });

    rows[ROW.MATCH_VALUES] = setRowCellTexts(rows[ROW.MATCH_VALUES]!, {
        1: { text: ctx.scheduleDay, kind: 'meta' },
        2: { text: ctx.time, kind: 'meta', center: true },
        3: { text: ctx.court, kind: 'meta' },
    });

    rows[ROW.TEAM_NAMES] = setRowCellTexts(rows[ROW.TEAM_NAMES]!, {
        0: { text: teamDisplayName(ctx.teamA), kind: 'team', center: true },
        1: { text: teamDisplayName(ctx.teamB), kind: 'team', center: true },
    });

    const playersA = ctx.teamA.players;
    const playersB = ctx.teamB.players;

    let staffAIdx = ROW.TEAM_A_ENT;
    staffAIdx = ensurePlayerRowSlots(rows, ROW.TEAM_A_PLAYER_FIRST, staffAIdx, playersA.length);
    const shiftA = staffAIdx - ROW.TEAM_A_ENT;

    for (let i = 0; i < playersA.length; i++) {
        const rowIdx = ROW.TEAM_A_PLAYER_FIRST + i;
        const p = playersA[i]!;
        if (rows[rowIdx]) rows[rowIdx] = setPlayerRowCells(rows[rowIdx], p.number, p.name);
    }

    const teamBFirst = ROW.TEAM_B_PLAYER_FIRST + shiftA;
    let staffBIdx = ROW.TEAM_B_ENT + shiftA;
    staffBIdx = ensurePlayerRowSlots(rows, teamBFirst, staffBIdx, playersB.length);

    for (let i = 0; i < playersB.length; i++) {
        const rowIdx = teamBFirst + i;
        const p = playersB[i]!;
        if (rows[rowIdx]) rows[rowIdx] = setPlayerRowCells(rows[rowIdx], p.number, p.name);
    }

    applyStaffLabels(rows, staffAIdx, staffBIdx);

    return before + joinTableRows(rows) + after;
}

/** Rellena la plantilla HTML oficial Kolosaurios conservando colores y diseño. */
export function fillActaHtmlTemplate(html: string, ctx: ActaExportContext): string {
    let out = fixTemplateAssetPaths(html);
    out = fixActaHeaderLogos(out);
    out = applyLocalVisitorLabels(out);
    out = fillTitle(out, ctx.competitionName);
    out = fillTable(out, ctx);
    const zoom = actaSinglePageZoom(ctx.teamA.players.length, ctx.teamB.players.length);
    out = injectSinglePagePrintStyles(out, zoom);
    return out;
}

/** Ancho/alto A4 en px (96 dpi) para captura fiable con html2canvas. */
export const ACTA_PDF_WIDTH_PX = 794;
export const ACTA_PDF_HEIGHT_PX = 1123;
/** Subir contenido en captura PDF (html2canvas deja el texto un poco bajo en celdas). */
export const ACTA_PDF_SHIFT_UP_PX = 22;

/** Prepara HTML para captura PDF: conserva layout 210mm de impresión, sin zoom CSS (usa transform en export). */
export function prepareActaHtmlForPdfExport(html: string, _contentZoom = 1): string {
    const out = html
        .replace(/<style id="acta-single-page">[\s\S]*?<\/style>/g, '')
        .replace(/\bacta-compact\s*/g, '');

    const capture = `<style id="acta-pdf-capture">
html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}
body.doc-content{width:${ACTA_PDF_WIDTH_PX}px!important;margin:0!important;padding:0!important}
#acta-pdf-capture-surface{width:210mm!important;max-width:210mm!important;margin:0 auto!important}
body.doc-content>div{width:210mm!important;max-width:210mm!important;margin:0 auto!important}
table{width:100%!important;margin:0 auto!important;border-collapse:collapse!important}
table td,table th{padding:0!important;vertical-align:top!important;line-height:0.92!important}
body table td p{line-height:0.92!important;margin:0!important;padding:0!important}
body table td p:not(.acta-team-name) span{line-height:0.92!important;vertical-align:top!important;display:inline-block;position:relative;top:-1px}
td.acta-team-cell{vertical-align:middle!important}
p.acta-team-name{height:auto!important;max-height:none!important;line-height:1!important;padding-bottom:5pt!important}
p.acta-team-name span{position:relative!important;top:-3px!important;line-height:1!important;display:block!important}
p.c267{text-align:center!important;margin:0 auto!important;padding:0!important;line-height:1.1!important}
p.c267 img{display:inline-block!important;vertical-align:middle!important;object-fit:contain!important}
</style>`;
    return out.replace('</head>', `${capture}</head>`);
}

/** Rutas relativas para PDF con puppeteer / archivo local (baseURL = /public). */
export function toActaOfflineAssetPaths(html: string): string {
    return html.replace(/src="\/templates\/images\//g, 'src="templates/images/');
}

export async function fetchActaHtmlTemplate(): Promise<string> {
    const res = await fetch(ACTA_HTML_TEMPLATE_URL);
    if (!res.ok) {
        throw new Error(`No se pudo cargar la plantilla HTML del acta (${res.status}).`);
    }
    return res.text();
}
