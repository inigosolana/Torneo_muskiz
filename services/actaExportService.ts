import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { Match, Team } from '../types';
import { buildActaExportContext, type ActaExportContext } from '../utils/actaBuildContext';
import { sortMatchesForActas } from '../utils/matchReportSheetUtils';
import {
    ACTA_TEMPLATE_PLAYER_ROWS,
    ACTA_TEMPLATE_URL,
    fetchActaTemplateBytes,
    fillActaTemplateBlob,
} from './actaTemplateFill';

function teamDisplayName(block: ActaExportContext['teamA']): string {
    return `${block.name}${block.city ? ` · ${block.city}` : ''}`;
}

let templateCache: ArrayBuffer | null = null;

async function loadTemplateBytes(): Promise<ArrayBuffer> {
    if (templateCache) return templateCache;
    templateCache = await fetchActaTemplateBytes();
    return templateCache;
}

/** Genera un .docx a partir de la plantilla Kolosaurios (logos, colores, layout oficial). */
export async function generateActaDocxBlob(ctx: ActaExportContext): Promise<Blob> {
    const template = await loadTemplateBytes();
    return fillActaTemplateBlob(ctx, template);
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

    const template = await loadTemplateBytes();
    const zip = new JSZip();
    const folder = zip.folder(safeZipFolder(label)) ?? zip;

    for (const match of sorted) {
        const ctx = buildActaExportContext(match, teams);
        if (format === 'docx' || format === 'both') {
            const blob = await fillActaTemplateBlob(ctx, template);
            const buf = await blob.arrayBuffer();
            folder.file(`acta_${ctx.fileBaseName}.docx`, buf);
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

/** Abre ventana de impresión (HTML simplificado; el DOCX usa la plantilla oficial). */
export function printActaHtml(match: Match, teams: Team[]): void {
    const ctx = buildActaExportContext(match, teams);
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
        throw new Error('Permite ventanas emergentes para imprimir el acta.');
    }

    const teamA = escapeHtml(teamDisplayName(ctx.teamA));
    const teamB = escapeHtml(teamDisplayName(ctx.teamB));
    const rowsA = ctx.teamA.players.slice(0, ACTA_TEMPLATE_PLAYER_ROWS);
    const rowsB = ctx.teamB.players.slice(0, ACTA_TEMPLATE_PLAYER_ROWS);
    while (rowsA.length < ACTA_TEMPLATE_PLAYER_ROWS) rowsA.push({ number: '', name: '', docsOk: true });
    while (rowsB.length < ACTA_TEMPLATE_PLAYER_ROWS) rowsB.push({ number: '', name: '', docsOk: true });

    const rosterRows = (players: typeof rowsA) =>
        players
            .map(
                (p) =>
                    `<tr><td class="c">${escapeHtml(p.number)}</td><td class="n">${escapeHtml(p.name)}</td><td></td><td></td><td></td><td></td></tr>`
            )
            .join('');

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Acta ${teamA}</title>
<style>
@page{size:A4 portrait;margin:8mm}
body{font-family:Arial,sans-serif;font-size:8px;margin:0}
h1{text-align:center;font-size:11px;margin:4px 0}
.note{text-align:center;font-size:7px;color:#555;margin-bottom:6px}
table{border-collapse:collapse;width:100%;margin-bottom:4px}
th,td{border:1px solid #000;padding:2px}
th{background:#d9e8f7;font-size:7px}
.c{text-align:center;width:8%}
.n{min-width:30%}
</style></head><body>
<h1>${escapeHtml(ctx.competitionName)}</h1>
<p class="note">Vista impresión rápida. Para el acta oficial con logos y formato RFEBM, descarga el DOCX.</p>
<table><tr><th>Torneo</th><th>Categoría</th><th>M/F</th><th>Fase</th><th>Grupo</th><th>Día</th></tr>
<tr><td>${escapeHtml(ctx.competitionName)}</td><td>${escapeHtml(ctx.category)}</td><td>${escapeHtml(ctx.gender)}</td><td>${escapeHtml(ctx.phase)}</td><td>${escapeHtml(ctx.group)}</td><td>${escapeHtml(ctx.scheduleDay)}</td></tr></table>
<table><tr><th>Hora</th><th>Campo</th><th>Equipo A</th><th>Equipo B</th></tr>
<tr><td>${escapeHtml(ctx.time)}</td><td>${escapeHtml(ctx.court)}</td><td>${teamA}</td><td>${teamB}</td></tr></table>
<h2 style="font-size:9px;margin:6px 0 2px">Equipo organizador (A)</h2>
<table><tr><th>Nº</th><th>Nombre</th><th>EX1</th><th>EX2</th><th>D</th><th>DD</th></tr>${rosterRows(rowsA)}</table>
<h2 style="font-size:9px;margin:6px 0 2px">Equipo visitante (B)</h2>
<table><tr><th>Nº</th><th>Nombre</th><th>EX1</th><th>EX2</th><th>D</th><th>DD</th></tr>${rosterRows(rowsB)}</table>
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

export { ACTA_TEMPLATE_URL };
