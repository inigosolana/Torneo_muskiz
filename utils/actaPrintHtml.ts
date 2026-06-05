import type { ActaExportContext } from './actaBuildContext';
import { fetchActaHtmlTemplate, fillActaHtmlTemplate } from '../services/actaHtmlTemplateFill';

let templateCache: string | null = null;

async function loadTemplate(): Promise<string> {
    if (templateCache) return templateCache;
    templateCache = await fetchActaHtmlTemplate();
    return templateCache;
}

/** HTML del acta listo para imprimir / PDF (plantilla oficial Kolosaurios). */
export async function buildActaPrintHtmlAsync(ctx: ActaExportContext): Promise<string> {
    const template = await loadTemplate();
    return fillActaHtmlTemplate(template, ctx);
}

/** Síncrono cuando ya tienes la plantilla cargada (p. ej. scripts Node). */
export function buildActaPrintHtmlFromTemplate(templateHtml: string, ctx: ActaExportContext): string {
    return fillActaHtmlTemplate(templateHtml, ctx);
}

export function primeActaHtmlTemplate(html: string): void {
    templateCache = html;
}
