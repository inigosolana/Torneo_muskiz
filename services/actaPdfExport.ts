import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ActaExportContext } from '../utils/actaBuildContext';
import { buildActaPrintHtmlAsync } from '../utils/actaPrintHtml';

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

/** Convierte el HTML del acta en un PDF A4 (1 página). */
export async function actaHtmlToPdfBlob(html: string): Promise<Blob> {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-12000px';
    iframe.style.top = '0';
    iframe.style.width = '210mm';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.overflow = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
        document.body.removeChild(iframe);
        throw new Error('No se pudo preparar el documento para el PDF.');
    }
    doc.open();
    doc.write(withDocumentBase(html));
    doc.close();

    const sheet = doc.body;

    try {
        await waitForImages(sheet);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        iframe.style.height = `${Math.max(sheet.scrollHeight, 1)}px`;

        const canvas = await html2canvas(sheet, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            backgroundColor: '#ffffff',
            width: sheet.scrollWidth,
            height: sheet.scrollHeight,
            imageTimeout: 15000,
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
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, drawW, drawH);
        return pdf.output('blob');
    } finally {
        document.body.removeChild(iframe);
    }
}

export async function generateActaPdfBlob(ctx: ActaExportContext): Promise<Blob> {
    const html = await buildActaPrintHtmlAsync(ctx);
    return actaHtmlToPdfBlob(html);
}
