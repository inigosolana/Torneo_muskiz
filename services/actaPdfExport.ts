import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ActaExportContext } from '../utils/actaBuildContext';
import { buildActaPrintHtmlAsync } from '../utils/actaPrintHtml';
import {
    ACTA_PDF_HEIGHT_PX,
    ACTA_PDF_SHIFT_UP_PX,
    ACTA_PDF_WIDTH_PX,
    actaSinglePageZoom,
    prepareActaHtmlForPdfExport,
} from './actaHtmlTemplateFill';

export interface ActaPdfExportOptions {
    /** Escala de captura html2canvas (2 = máxima nitidez; 1.25–1.5 recomendado en lotes grandes). */
    captureScale?: number;
}

export interface ActaCapturedPage {
    dataUrl: string;
    format: 'PNG' | 'JPEG';
    ratio: number;
}

const CAPTURE_ROOT_ID = 'acta-pdf-capture-root';
const CAPTURE_SURFACE_ID = 'acta-pdf-capture-surface';

const DEFAULT_CAPTURE_SCALE = 2;
const BULK_CAPTURE_SCALE = 1.35;

export function bulkActaCaptureScale(): number {
    return BULK_CAPTURE_SCALE;
}

function waitForImages(root: HTMLElement): Promise<void> {
    const imgs = [...root.querySelectorAll('img')];
    if (!imgs.length) return Promise.resolve();
    return Promise.all(
        imgs.map(
            (img) =>
                new Promise<void>((resolve) => {
                    if (img.complete) {
                        resolve();
                        return;
                    }
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                }),
        ),
    ).then(() => undefined);
}

function withDocumentBase(html: string): string {
    const base = `${window.location.origin}/`;
    if (html.includes('<base ')) return html;
    return html.replace('<head>', `<head><base href="${base}">`);
}

function mountCaptureSurface(doc: Document): { root: HTMLElement; surface: HTMLElement } {
    const body = doc.body;
    const root = doc.createElement('div');
    root.id = CAPTURE_ROOT_ID;
    root.style.width = `${ACTA_PDF_WIDTH_PX}px`;
    root.style.margin = '0';
    root.style.padding = '0';
    root.style.overflow = 'hidden';
    root.style.background = '#ffffff';

    const surface = doc.createElement('div');
    surface.id = CAPTURE_SURFACE_ID;
    surface.style.width = '210mm';
    surface.style.margin = '0 auto';
    surface.style.transformOrigin = 'top center';
    surface.style.background = '#ffffff';
    while (body.firstChild) {
        surface.appendChild(body.firstChild);
    }

    root.appendChild(surface);
    body.appendChild(root);
    body.style.margin = '0';
    body.style.padding = '0';
    body.style.width = `${ACTA_PDF_WIDTH_PX}px`;
    body.style.background = '#ffffff';

    return { root, surface };
}

function applyCaptureScale(surface: HTMLElement, scale: number): number {
    surface.style.transform = `translateY(-${ACTA_PDF_SHIFT_UP_PX}px) scale(${scale})`;
    surface.style.transformOrigin = 'top center';
    return Math.max(1, Math.ceil(surface.scrollHeight * scale));
}

function canvasToDataUrl(canvas: HTMLCanvasElement): { dataUrl: string; format: 'PNG' | 'JPEG' } {
    try {
        return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG' };
    } catch {
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), format: 'JPEG' };
    }
}

async function renderActaCaptureCanvas(
    html: string,
    contentZoom: number,
    captureScale: number,
): Promise<ActaCapturedPage> {
    const prepared = prepareActaHtmlForPdfExport(withDocumentBase(html), contentZoom);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-12000px';
    iframe.style.top = '0';
    iframe.style.width = `${ACTA_PDF_WIDTH_PX}px`;
    iframe.style.height = `${ACTA_PDF_HEIGHT_PX}px`;
    iframe.style.border = '0';
    iframe.style.overflow = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
        document.body.removeChild(iframe);
        throw new Error('No se pudo preparar el documento para el PDF.');
    }
    doc.open();
    doc.write(prepared);
    doc.close();

    try {
        const { root, surface } = mountCaptureSurface(doc);

        await waitForImages(surface);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        let scale = Math.min(1, contentZoom);
        let visualHeight: number;
        if (scale >= 0.999) {
            surface.style.transform = `translateY(-${ACTA_PDF_SHIFT_UP_PX}px)`;
            surface.style.transformOrigin = 'top center';
            visualHeight = surface.scrollHeight;
        } else {
            visualHeight = applyCaptureScale(surface, scale);
        }

        if (visualHeight > ACTA_PDF_HEIGHT_PX) {
            scale *= (ACTA_PDF_HEIGHT_PX / visualHeight) * 0.995;
            visualHeight = applyCaptureScale(surface, scale);
        }

        root.style.height = `${Math.min(ACTA_PDF_HEIGHT_PX, visualHeight)}px`;
        iframe.style.height = `${Math.min(ACTA_PDF_HEIGHT_PX, visualHeight)}px`;

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const captureTarget = scale >= 0.999 ? surface : root;
        const captureHeight = Math.min(ACTA_PDF_HEIGHT_PX, visualHeight);
        const canvasOptions = {
            scale: captureScale,
            logging: false,
            backgroundColor: '#ffffff',
            width: scale >= 0.999 ? undefined : ACTA_PDF_WIDTH_PX,
            height: scale >= 0.999 ? undefined : captureHeight,
            windowWidth: ACTA_PDF_WIDTH_PX,
            windowHeight: visualHeight,
            imageTimeout: 20000,
            letterRendering: true,
            foreignObjectRendering: false,
            onclone: (clonedDoc: Document) => {
                const clonedSurface = clonedDoc.getElementById(CAPTURE_SURFACE_ID);
                if (clonedSurface) {
                    const el = clonedSurface as HTMLElement;
                    el.style.zoom = '1';
                    el.style.webkitFontSmoothing = 'antialiased';
                }
            },
        };

        let canvas: HTMLCanvasElement;
        try {
            canvas = await html2canvas(captureTarget, {
                ...canvasOptions,
                useCORS: true,
                allowTaint: false,
            });
        } catch {
            canvas = await html2canvas(captureTarget, {
                ...canvasOptions,
                useCORS: true,
                allowTaint: true,
            });
        }

        const { dataUrl, format } = canvasToDataUrl(canvas);
        return { dataUrl, format, ratio: canvas.width / canvas.height };
    } finally {
        document.body.removeChild(iframe);
    }
}

function capturedPageToPdfBlob(page: ActaCapturedPage): Blob {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const drawW = pageW;
    const drawH = Math.min(pageH, drawW / page.ratio);
    pdf.addImage(page.dataUrl, page.format, 0, 0, drawW, drawH, undefined, 'FAST');
    return pdf.output('blob');
}

/** Convierte el HTML del acta en un PDF A4 (1 página). */
export async function actaHtmlToPdfBlob(
    html: string,
    contentZoom = 1,
    options: ActaPdfExportOptions = {},
): Promise<Blob> {
    const captureScale = options.captureScale ?? DEFAULT_CAPTURE_SCALE;
    const page = await renderActaCaptureCanvas(html, contentZoom, captureScale);
    return capturedPageToPdfBlob(page);
}

export async function captureActaPageFromContext(
    ctx: ActaExportContext,
    options: ActaPdfExportOptions = {},
): Promise<ActaCapturedPage> {
    const html = await buildActaPrintHtmlAsync(ctx);
    const contentZoom = actaSinglePageZoom(ctx.teamA.players.length, ctx.teamB.players.length);
    const captureScale = options.captureScale ?? DEFAULT_CAPTURE_SCALE;
    return renderActaCaptureCanvas(html, contentZoom, captureScale);
}

export async function generateActaPdfBlob(
    ctx: ActaExportContext,
    options: ActaPdfExportOptions = {},
): Promise<Blob> {
    const page = await captureActaPageFromContext(ctx, options);
    return capturedPageToPdfBlob(page);
}

/** Pausa breve para que el navegador libere memoria entre actas en exportaciones masivas. */
export function yieldBetweenActaExports(index: number): Promise<void> {
    const delay = index > 0 && index % 8 === 0 ? 120 : 0;
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            if (delay > 0) {
                window.setTimeout(resolve, delay);
            } else {
                resolve();
            }
        });
    });
}
