import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { Match, Team } from '../types';
import { buildActaExportContext, type ActaExportContext } from '../utils/actaBuildContext';
import { buildActaPrintHtmlAsync } from '../utils/actaPrintHtml';
import { sortMatchesForActas } from '../utils/matchReportSheetUtils';
import {
    bulkActaCaptureScale,
    captureActaPageFromContext,
    generateActaPdfBlob,
    yieldBetweenActaExports,
    type ActaPdfExportOptions,
} from './actaPdfExport';
import { jsPDF } from 'jspdf';
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

export type ActaBulkExportProgress = (current: number, total: number, fileBaseName: string) => void;

const bulkPdfOptions: ActaPdfExportOptions = { captureScale: bulkActaCaptureScale() };

async function generateBulkActaPdfBlob(
    match: Match,
    teams: Team[],
    usedNames: Set<string>,
): Promise<{ blob: Blob; fileName: string }> {
    const ctx = buildActaExportContext(match, teams);
    let fileName = `acta_${ctx.fileBaseName}.pdf`;
    if (usedNames.has(fileName)) {
        const suffix = (match.id ?? 'dup').slice(0, 8);
        fileName = `acta_${ctx.fileBaseName}_${suffix}.pdf`;
    }
    usedNames.add(fileName);
    const blob = await generateActaPdfBlob(ctx, bulkPdfOptions);
    return { blob, fileName };
}

export async function downloadActasZip(
    label: string,
    matchList: Match[],
    teams: Team[],
    format: 'pdf' | 'docx' | 'both' = 'pdf',
    onProgress?: ActaBulkExportProgress,
): Promise<void> {
    const sorted = sortMatchesForActas(matchList);
    if (sorted.length === 0) throw new Error('No hay partidos para exportar.');

    const zip = new JSZip();
    const folder = zip.folder(safeZipFolder(label)) ?? zip;
    const template = format === 'docx' || format === 'both' ? await loadTemplateBytes() : null;
    const usedNames = new Set<string>();
    const failures: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const match = sorted[i];
        const ctx = buildActaExportContext(match, teams);
        onProgress?.(i + 1, sorted.length, ctx.fileBaseName);
        try {
            if (format === 'pdf' || format === 'both') {
                const { blob, fileName } = await generateBulkActaPdfBlob(match, teams, usedNames);
                const buf = await blob.arrayBuffer();
                folder.file(fileName, buf);
            }
            if ((format === 'docx' || format === 'both') && template) {
                const blob = await fillActaTemplateBlob(ctx, template);
                const buf = await blob.arrayBuffer();
                folder.file(`acta_${ctx.fileBaseName}.docx`, buf);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error desconocido';
            failures.push(`${ctx.teamA.name} vs ${ctx.teamB.name} (${match.time}): ${msg}`);
        }
        await yieldBetweenActaExports(i);
    }

    const added = Object.values(folder.files).filter((f) => !f.dir).length;
    if (added === 0) {
        throw new Error(
            failures[0] ?? 'No se pudo generar ningún acta. Prueba «Imprimir todas (PDF)» o descarga por categoría.',
        );
    }

    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
    const ext = format === 'both' ? 'pdf_docx' : format;
    saveAs(zipBlob, `actas_${safeZipFolder(label)}_${added}_${ext}.zip`);

    if (failures.length > 0) {
        throw new Error(
            `ZIP con ${added}/${sorted.length} actas. Fallaron ${failures.length}: ${failures.slice(0, 3).join(' · ')}`,
        );
    }
}

/** Un solo PDF con todas las actas (1 hoja A4 por partido). Ideal para copistería. */
export async function downloadActasMergedPdf(
    label: string,
    matchList: Match[],
    teams: Team[],
    onProgress?: ActaBulkExportProgress,
): Promise<void> {
    const sorted = sortMatchesForActas(matchList);
    if (sorted.length === 0) throw new Error('No hay partidos para exportar.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const failures: string[] = [];
    let pagesAdded = 0;

    for (let i = 0; i < sorted.length; i++) {
        const match = sorted[i];
        const ctx = buildActaExportContext(match, teams);
        onProgress?.(i + 1, sorted.length, ctx.fileBaseName);
        try {
            const page = await captureActaPageFromContext(ctx, bulkPdfOptions);
            if (pagesAdded > 0) pdf.addPage();
            const drawW = pageW;
            const drawH = Math.min(pageH, drawW / page.ratio);
            pdf.addImage(page.dataUrl, page.format, 0, 0, drawW, drawH, undefined, 'FAST');
            pagesAdded += 1;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error desconocido';
            failures.push(`${ctx.teamA.name} vs ${ctx.teamB.name}: ${msg}`);
        }
        await yieldBetweenActaExports(i);
    }

    if (pagesAdded === 0) {
        throw new Error(
            failures[0] ?? 'No se pudo generar el PDF. Usa «Imprimir todas (PDF)» desde el navegador.',
        );
    }

    saveAs(pdf.output('blob'), `actas_${safeZipFolder(label)}_${pagesAdded}_paginas.pdf`);

    if (failures.length > 0) {
        throw new Error(
            `PDF con ${pagesAdded}/${sorted.length} actas. Fallaron ${failures.length}: ${failures.slice(0, 3).join(' · ')}`,
        );
    }
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
