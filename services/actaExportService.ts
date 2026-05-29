import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    AlignmentType,
    BorderStyle,
    VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { Match, Team } from '../types';
import { MATCH_REPORT_GRID_ROWS } from '../utils/matchReportSheetUtils';
import { buildActaExportContext, type ActaExportContext } from '../utils/actaBuildContext';
import { sortMatchesForActas } from '../utils/matchReportSheetUtils';

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function cell(
    text: string,
    opts?: { bold?: boolean; width?: number; center?: boolean; colSpan?: number }
): TableCell {
    return new TableCell({
        borders: cellBorders,
        verticalAlign: VerticalAlign.CENTER,
        width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        columnSpan: opts?.colSpan,
        children: [
            new Paragraph({
                alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
                children: [
                    new TextRun({
                        text: text || '',
                        bold: opts?.bold ?? false,
                        size: 14,
                        font: 'Arial',
                    }),
                ],
            }),
        ],
    });
}

function headerRow(cells: string[]): TableRow {
    return new TableRow({
        children: cells.map((t) => cell(t, { bold: true, center: true })),
    });
}

function dataRow(values: string[]): TableRow {
    return new TableRow({
        children: values.map((t) => cell(t)),
    });
}

function rosterGridRows(ctx: ActaExportContext): TableRow[] {
    const rows: TableRow[] = [];
    const pad = (players: ActaExportContext['teamA']['players']) => {
        const list = [...players];
        while (list.length < MATCH_REPORT_GRID_ROWS) {
            list.push({ number: '', name: '', docsOk: true });
        }
        return list.slice(0, MATCH_REPORT_GRID_ROWS);
    };
    const listA = pad(ctx.teamA.players);
    const listB = pad(ctx.teamB.players);

    rows.push(
        headerRow([
            'Nº',
            'NOMBRE A',
            'EX1',
            'EX2',
            'D',
            'DD',
            'JA',
            'TA',
            'TB',
            'JB',
            'JA',
            'TA',
            'TB',
            'JB',
            'Nº',
            'TA',
            'Nº',
            'TB',
            'JB',
            'Nº',
            'NOMBRE B',
            'EX1',
            'EX2',
            'D',
            'DD',
        ])
    );

    for (let i = 0; i < MATCH_REPORT_GRID_ROWS; i++) {
        const a = listA[i]!;
        const b = listB[i]!;
        rows.push(
            new TableRow({
                children: [
                    cell(a.number, { center: true }),
                    cell(a.name),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(b.number, { center: true }),
                    cell(b.name),
                    cell(''),
                    cell(''),
                    cell(''),
                    cell(''),
                ],
            })
        );
    }
    return rows;
}

/** Genera un .docx alineado al modelo acta playa Kolosaurios (tablas rellenables). */
export async function generateActaDocxBlob(ctx: ActaExportContext): Promise<Blob> {
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        size: { width: 11906, height: 16838 },
                        margin: { top: 400, right: 400, bottom: 400, left: 400 },
                    },
                },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({
                                text: ctx.competitionName,
                                bold: true,
                                size: 28,
                                font: 'Arial',
                            }),
                        ],
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: 'ACTA BALONMANO PLAYA', bold: true, size: 18 })],
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({ text: '' }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            headerRow(['TORNEO', 'CATEGORÍA', 'MAS/FEM/MIX', 'FASE', 'GRUPO', 'JORNADA']),
                            dataRow([
                                ctx.competitionName,
                                ctx.category,
                                ctx.gender,
                                ctx.phase,
                                ctx.group,
                                ctx.scheduleDay,
                            ]),
                        ],
                    }),
                    new Paragraph({ text: '' }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            headerRow(['TEMPORADA', 'FECHA', 'HORA', 'TERRENO DE JUEGO']),
                            dataRow(['', ctx.scheduleDay, ctx.time, ctx.court]),
                        ],
                    }),
                    new Paragraph({ text: '' }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            headerRow(['EQUIPO ORGANIZADOR (A)', 'RESULTADO', 'EQUIPO VISITANTE (B)']),
                            dataRow([
                                `${ctx.teamA.name}${ctx.teamA.city ? ` · ${ctx.teamA.city}` : ''}`,
                                '',
                                `${ctx.teamB.name}${ctx.teamB.city ? ` · ${ctx.teamB.city}` : ''}`,
                            ]),
                        ],
                    }),
                    new Paragraph({ text: '' }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: 'Plantilla y tanteo (rellenar en pista)',
                                italics: true,
                                size: 16,
                            }),
                        ],
                    }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: rosterGridRows(ctx),
                    }),
                    new Paragraph({ text: '' }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            headerRow(['ÁRBITRO 1', 'ÁRBITRO 2', 'ANOTADOR', 'CRONOMETRADOR']),
                            dataRow(['', '', '', '']),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: 'Modelo Kolosaurios / Torneo Muskiz — generado automáticamente.',
                                size: 14,
                                italics: true,
                            }),
                        ],
                    }),
                ],
            },
        ],
    });

    return Packer.toBlob(doc);
}

export async function downloadActaDocx(match: Match, teams: Team[]): Promise<void> {
    const ctx = buildActaExportContext(match, teams);
    const blob = await generateActaDocxBlob(ctx);
    saveAs(blob, `acta_${ctx.fileBaseName}.docx`);
}

export async function downloadActasZip(
    label: string,
    matchList: Match[],
    teams: Team[],
    format: 'docx' | 'both' = 'docx'
): Promise<void> {
    const sorted = sortMatchesForActas(matchList);
    if (sorted.length === 0) throw new Error('No hay partidos para exportar.');

    const zip = new JSZip();
    const folder = zip.folder(safeZipFolder(label)) ?? zip;

    for (const match of sorted) {
        const ctx = buildActaExportContext(match, teams);
        if (format === 'docx' || format === 'both') {
            const blob = await generateActaDocxBlob(ctx);
            folder.file(`acta_${ctx.fileBaseName}.docx`, blob);
        }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `actas_${safeZipFolder(label)}_${sorted.length}.zip`);
}

function safeZipFolder(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 48);
}

/** Abre ventana de impresión con el HTML del acta (PDF vía «Guardar como PDF»). */
export function printActaHtml(match: Match, teams: Team[]): void {
    const ctx = buildActaExportContext(match, teams);
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
        throw new Error('Permite ventanas emergentes para imprimir el acta.');
    }

    const gridHtml = (() => {
        const listA = [...ctx.teamA.players];
        const listB = [...ctx.teamB.players];
        while (listA.length < MATCH_REPORT_GRID_ROWS) listA.push({ number: '', name: '', docsOk: true });
        while (listB.length < MATCH_REPORT_GRID_ROWS) listB.push({ number: '', name: '', docsOk: true });
        let html = '';
        for (let i = 0; i < MATCH_REPORT_GRID_ROWS; i++) {
            const a = listA[i]!;
            const b = listB[i]!;
            html += `<tr>
        <td class="c">${a.number}</td><td class="n">${escapeHtml(a.name)}</td>
        <td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td>
        <td class="s"></td><td class="s"></td><td class="s"></td><td class="s"></td>
        <td class="s"></td><td class="s"></td><td class="s"></td><td class="s"></td>
        <td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td>
        <td class="c">${b.number}</td><td class="n">${escapeHtml(b.name)}</td>
        <td class="c"></td><td class="c"></td><td class="c"></td><td class="c"></td>
      </tr>`;
        }
        return html;
    })();

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Acta ${escapeHtml(ctx.teamA.name)}</title>
<style>
@page{size:A4 portrait;margin:6mm}
body{font-family:Arial,sans-serif;font-size:6px;margin:0}
h1{text-align:center;font-size:10px;margin:4px 0}
table{border-collapse:collapse;width:100%;table-layout:fixed}
th,td{border:1px solid #000;padding:1px 2px;vertical-align:middle}
th{background:#eee;font-size:5px;text-transform:uppercase}
.c{text-align:center;width:2%}
.n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:5px}
.s{height:6px}
</style></head><body>
<h1>${escapeHtml(ctx.competitionName)}</h1>
<table><tr><th>Torneo</th><th>Categoría</th><th>M/F</th><th>Fase</th><th>Grupo</th><th>Día</th></tr>
<tr><td>${escapeHtml(ctx.competitionName)}</td><td>${escapeHtml(ctx.category)}</td><td>${escapeHtml(ctx.gender)}</td><td>${escapeHtml(ctx.phase)}</td><td>${escapeHtml(ctx.group)}</td><td>${escapeHtml(ctx.scheduleDay)}</td></tr></table>
<table><tr><th>Hora</th><th>Campo</th><th colspan="2">Equipos</th></tr>
<tr><td>${escapeHtml(ctx.time)}</td><td>${escapeHtml(ctx.court)}</td><td colspan="2">${escapeHtml(ctx.teamA.name)} vs ${escapeHtml(ctx.teamB.name)}</td></tr></table>
<table>${gridHtml}</table>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
    w.document.close();
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
