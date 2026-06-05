import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ActaExportContext } from '../utils/actaBuildContext';
import { buildActaPrintHtmlAsync } from '../utils/actaPrintHtml';
import {
    ACTA_PDF_HEIGHT_PX,
    ACTA_PDF_WIDTH_PX,
    prepareActaHtmlForPdfExport,
} from './actaHtmlTemplateFill';

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

function applyFitZoom(body: HTMLElement, zoom: number): void {
    body.style.zoom = String(zoom);
    body.style.width = `${ACTA_PDF_WIDTH_PX}px`;
    body.style.margin = '0';
    body.style.padding = '0';
    body.style.background = '#ffffff';
}

/** Convierte el HTML del acta en un PDF A4 (1 página). */
export async function actaHtmlToPdfBlob(html: string): Promise<Blob> {
    const prepared = prepareActaHtmlForPdfExport(withDocumentBase(html));

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

    const sheet = doc.body;

    try {
        await waitForImages(sheet);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const naturalHeight = sheet.scrollHeight;
        const fitZoom = Math.min(1, (ACTA_PDF_HEIGHT_PX / Math.max(naturalHeight, 1)) * 0.995);
        applyFitZoom(sheet, fitZoom);

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const captureHeight = Math.min(ACTA_PDF_HEIGHT_PX, Math.ceil(sheet.scrollHeight));
        iframe.style.height = `${captureHeight}px`;

        const canvas = await html2canvas(sheet, {
            scale: 3,
            useCORS: true,
            allowTaint: false,
            logging: false,
            backgroundColor: '#ffffff',
            width: ACTA_PDF_WIDTH_PX,
            height: captureHeight,
            windowWidth: ACTA_PDF_WIDTH_PX,
            windowHeight: captureHeight,
            imageTimeout: 20000,
        });

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'MEDIUM');
        return pdf.output('blob');
    } finally {
        document.body.removeChild(iframe);
    }
}

export async function generateActaPdfBlob(ctx: ActaExportContext): Promise<Blob> {
    const html = await buildActaPrintHtmlAsync(ctx);
    return actaHtmlToPdfBlob(html);
}
