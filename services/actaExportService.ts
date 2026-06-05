import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { Match, Team } from '../types';
import { buildActaExportContext, type ActaExportContext } from '../utils/actaBuildContext';
import { buildActaPrintHtmlAsync } from '../utils/actaPrintHtml';
import { sortMatchesForActas } from '../utils/matchReportSheetUtils';
import { generateActaPdfBlob } from './actaPdfExport';
import {
    ACTA_TEMPLATE_URL,
    fetchActaTemplateBytes,
    fillActaTemplateBlob,
} from './actaTemplateFill';

let templateCache: ArrayBuffer | null = null;

async function loadTemplateBytes(): Promise<ArrayBuffer> {
    if (templateCache) return templateCache;
    templateCache = await fetchActaTemplateBytes();
    return templateCache;
}

/** Genera PDF del acta (equipos, dorsales, nombres) en 1 página A4. */
export async function generateActaPdfFromMatch(match: Match, teams: Team[]): Promise<Blob> {
    const ctx = buildActaExportContext(match, teams);
    return generateActaPdfBlob(ctx);
}

/** @deprecated Usa generateActaPdfFromMatch — el DOCX de plantilla Word es poco fiable. */
export async function generateActaDocxBlob(ctx: ActaExportContext): Promise<Blob> {
    const template = await loadTemplateBytes();
    return fillActaTemplateBlob(ctx, template);
}

export async function downloadActaPdf(match: Match, teams: Team[]): Promise<void> {
    const ctx = buildActaExportContext(match, teams);
    const blob = await generateActaPdfBlob(ctx);
    saveAs(blob, `acta_${ctx.fileBaseName}.pdf`);
}

/** @deprecated */
export async function downloadActaDocx(match: Match, teams: Team[]): Promise<void> {
    const ctx = buildActaExportContext(match, teams);
    const blob = await generateActaDocxBlob(ctx);
    saveAs(blob, `acta_${ctx.fileBaseName}.docx`);
}

export async function downloadActasZip(
    label: string,
    matchList: Match[],
    teams: Team[],
    format: 'pdf' | 'docx' | 'both' = 'pdf',
): Promise<void> {
    const sorted = sortMatchesForActas(matchList);
    if (sorted.length === 0) throw new Error('No hay partidos para exportar.');

    const zip = new JSZip();
    const folder = zip.folder(safeZipFolder(label)) ?? zip;
    const template = format === 'docx' || format === 'both' ? await loadTemplateBytes() : null;

    for (const match of sorted) {
        const ctx = buildActaExportContext(match, teams);
        if (format === 'pdf' || format === 'both') {
            const blob = await generateActaPdfBlob(ctx);
            const buf = await blob.arrayBuffer();
            folder.file(`acta_${ctx.fileBaseName}.pdf`, buf);
        }
        if ((format === 'docx' || format === 'both') && template) {
            const blob = await fillActaTemplateBlob(ctx, template);
            const buf = await blob.arrayBuffer();
            folder.file(`acta_${ctx.fileBaseName}.docx`, buf);
        }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const ext = format === 'both' ? 'pdf_docx' : format;
    saveAs(zipBlob, `actas_${safeZipFolder(label)}_${sorted.length}_${ext}.zip`);
}

/** Abre ventana de impresión / guardar como PDF del acta. */
export async function printActaHtml(match: Match, teams: Team[]): Promise<void> {
    const ctx = buildActaExportContext(match, teams);
    const html = await buildActaPrintHtmlAsync(ctx);
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
        throw new Error('Permite ventanas emergentes para imprimir el acta.');
    }
    const base = `${window.location.origin}/`;
    const withBase = html.includes('<base ')
        ? html
        : html.replace('<head>', `<head><base href="${base}">`);
    w.document.write(withBase);
    w.document.close();
    w.onload = () => w.print();
}

function safeZipFolder(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 48);
}

export { ACTA_TEMPLATE_URL };
