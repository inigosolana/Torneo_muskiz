import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ActaExportContext } from '../utils/actaBuildContext';
import { buildActaPrintHtmlAsync } from '../utils/actaPrintHtml';
import {
    ACTA_PDF_HEIGHT_PX,
    ACTA_PDF_WIDTH_PX,
    actaSinglePageZoom,
    prepareActaHtmlForPdfExport,
} from './actaHtmlTemplateFill';

const CAPTURE_ROOT_ID = 'acta-pdf-capture-root';
const CAPTURE_SURFACE_ID = 'acta-pdf-capture-surface';

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
    surface.style.transform = `scale(${scale})`;
    return Math.max(1, Math.ceil(surface.scrollHeight * scale));
}

/** Convierte el HTML del acta en un PDF A4 (1 página). */
export async function actaHtmlToPdfBlob(html: string, contentZoom = 1): Promise<Blob> {
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
            surface.style.transform = 'none';
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
        const canvas = await html2canvas(captureTarget, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            backgroundColor: '#ffffff',
            width: scale >= 0.999 ? undefined : ACTA_PDF_WIDTH_PX,
            height: scale >= 0.999 ? undefined : captureHeight,
            windowWidth: ACTA_PDF_WIDTH_PX,
            windowHeight: visualHeight,
            imageTimeout: 20000,
            letterRendering: true,
            foreignObjectRendering: false,
            onclone: (clonedDoc) => {
                const clonedSurface = clonedDoc.getElementById(CAPTURE_SURFACE_ID);
                if (clonedSurface) {
                    const el = clonedSurface as HTMLElement;
                    el.style.zoom = '1';
                    el.style.webkitFontSmoothing = 'antialiased';
                }
            },
        });

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = canvas.width / canvas.height;
        let drawW = pageW;
        let drawH = drawW / ratio;
        if (drawH > pageH) {
            drawH = pageH;
            drawW = drawH * ratio;
        }
        const x = (pageW - drawW) / 2;
        const y = Math.max(0, (pageH - drawH) / 2);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, drawW, drawH, undefined, 'FAST');
        return pdf.output('blob');
    } finally {
        document.body.removeChild(iframe);
    }
}

export async function generateActaPdfBlob(ctx: ActaExportContext): Promise<Blob> {
    const html = await buildActaPrintHtmlAsync(ctx);
    const contentZoom = actaSinglePageZoom(ctx.teamA.players.length, ctx.teamB.players.length);
    return actaHtmlToPdfBlob(html, contentZoom);
}
