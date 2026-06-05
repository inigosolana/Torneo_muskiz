import JSZip from 'jszip';
import type { ActaExportContext, ActaPlayerLine } from '../utils/actaBuildContext';

/** Plantilla oficial Kolosaurios / RFEBM (logos, colores, layout). */
export const ACTA_TEMPLATE_URL = '/templates/acta-playa_kolosaurios.docx';

/** Filas de jugador por equipo en la plantilla (sin contar OF-A/B/C). */
export const ACTA_TEMPLATE_PLAYER_ROWS = 12;

/** Índices de fila (0-based) dentro de la única tabla de `document.xml`. */
const ROW = {
    COMPETITION_VALUES: 2,
    MATCH_VALUES: 5,
    TEAM_A_NAME: 8,
    TEAM_B_NAME: 8,
    TEAM_A_PLAYER_FIRST: 12,
    TEAM_B_PLAYER_FIRST: 31,
} as const;

function escapeXmlText(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function splitRowCells(rowXml: string): { cells: string[]; starts: number[]; ends: number[] } {
    const cells: string[] = [];
    const starts: number[] = [];
    const ends: number[] = [];
    let pos = 0;
    while (pos < rowXml.length) {
        const idx1 = rowXml.indexOf('<w:tc ', pos);
        const idx2 = rowXml.indexOf('<w:tc>', pos);
        const start = idx1 >= 0 && (idx2 < 0 || idx1 <= idx2) ? idx1 : idx2;
        if (start < 0) break;
        const end = rowXml.indexOf('</w:tc>', start);
        if (end < 0) break;
        starts.push(start);
        ends.push(end + 7);
        cells.push(rowXml.slice(start, end + 7));
        pos = end + 7;
    }
    return { cells, starts, ends };
}

const ACTA_CELL_FONT_HALF_POINTS = '12'; // 6 pt — compacto como el modelo impreso

function compactParagraph(text: string, center = false): string {
    const safe = escapeXmlText(text);
    const jc = center ? 'center' : 'left';
    const run = `<w:r><w:rPr><w:sz w:val="${ACTA_CELL_FONT_HALF_POINTS}"/><w:szCs w:val="${ACTA_CELL_FONT_HALF_POINTS}"/><w:noWrap/></w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r>`;
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="exact"/><w:jc w:val="${jc}"/></w:pPr>${run}</w:p>`;
}

function setCellContent(tcXml: string, text: string, center = false): string {
    if (!text) return tcXml;
    const paragraph = compactParagraph(text, center);
    if (/<w:p[^>]*>/.test(tcXml)) {
        return tcXml.replace(/<w:p[^>]*>[\s\S]*?<\/w:p>/, paragraph);
    }
    if (tcXml.includes('</w:tcPr>')) {
        return tcXml.replace('</w:tcPr>', `</w:tcPr>${paragraph}`);
    }
    return tcXml.replace(/^(<w:tc[^>]*>)/, `$1${paragraph}`);
}

function setPlayerRowCells(rowXml: string, number: string, name: string): string {
    const { cells, starts, ends } = splitRowCells(rowXml);
    let out = rowXml;
    const patches: [number, string, boolean][] = [
        [1, name, false],
        [0, number, true],
    ];
    for (const [col, text, center] of patches) {
        if (col >= cells.length) continue;
        const updated = setCellContent(cells[col]!, text, center);
        out = out.slice(0, starts[col]!) + updated + out.slice(ends[col]!);
    }
    return out;
}

function setRowCellTexts(rowXml: string, assignments: Record<number, string>): string {
    const { cells, starts, ends } = splitRowCells(rowXml);
    let out = rowXml;
    const ordered = Object.entries(assignments)
        .map(([k, v]) => [Number(k), v] as const)
        .sort((a, b) => b[0] - a[0]);
    for (const [col, text] of ordered) {
        if (col < 0 || col >= cells.length) continue;
        const updated = setCellContent(cells[col]!, text);
        out = out.slice(0, starts[col]) + updated + out.slice(ends[col]!);
    }
    return out;
}

function splitTableRows(tableXml: string): string[] {
    const parts = tableXml.split('<w:tr>');
    return parts.slice(1).map((chunk) => {
        const end = chunk.indexOf('</w:tr>');
        return end >= 0 ? chunk.slice(0, end) : chunk;
    });
}

function joinTableRows(prefix: string, rows: string[]): string {
    return prefix + rows.map((r) => `<w:tr>${r}</w:tr>`).join('');
}

function padPlayers(players: ActaPlayerLine[]): ActaPlayerLine[] {
    const list = [...players];
    while (list.length < ACTA_TEMPLATE_PLAYER_ROWS) {
        list.push({ number: '', name: '', docsOk: true });
    }
    return list.slice(0, ACTA_TEMPLATE_PLAYER_ROWS);
}

function teamDisplayName(block: ActaExportContext['teamA']): string {
    const name = (block.name ?? '').trim();
    const city = (block.city ?? '').trim();
    if (!city) return name;
    const full = `${name} · ${city}`;
    return full.length > 38 ? name : full;
}

/** Evita que Word parta el acta en 2 páginas (columnas de sección / márgenes amplios). */
function enforceSinglePageLayout(xml: string): string {
    let out = xml.replace(/<w:cols[\s\S]*?<\/w:cols>/g, '');
    out = out.replace(
        /<w:pgMar[^/>]*\/>/g,
        '<w:pgMar w:bottom="200" w:top="360" w:left="480" w:right="480" w:header="280" w:footer="200"/>'
    );
    out = out.replace(/<w:cantSplit w:val="0"\/>/g, '<w:cantSplit w:val="1"/>');
    return out;
}

function fillDocumentTable(xml: string, ctx: ActaExportContext): string {
    const tblIdx = xml.indexOf('<w:tbl>');
    if (tblIdx < 0) throw new Error('Plantilla acta: no se encontró la tabla principal.');
    const before = xml.slice(0, tblIdx);
    const rest = xml.slice(tblIdx);
    const tableClose = '</w:tbl>';
    const tableEnd = rest.indexOf(tableClose);
    if (tableEnd < 0) throw new Error('Plantilla acta: tabla principal sin cierre.');
    const tableInner = rest.slice('<w:tbl>'.length, tableEnd);
    const after = rest.slice(tableEnd + tableClose.length);

    const rows = splitTableRows(tableInner);

    rows[ROW.COMPETITION_VALUES] = setRowCellTexts(rows[ROW.COMPETITION_VALUES]!, {
        0: ctx.competitionName,
        1: ctx.category,
        2: ctx.gender,
        3: ctx.phase,
        4: ctx.group,
        // La plantilla tiene 5 celdas de datos para 6 cabeceras; jornada va en fecha del partido.
    });

    rows[ROW.MATCH_VALUES] = setRowCellTexts(rows[ROW.MATCH_VALUES]!, {
        1: ctx.scheduleDay,
        2: ctx.time,
        3: ctx.court,
    });

    rows[ROW.TEAM_A_NAME] = setRowCellTexts(rows[ROW.TEAM_A_NAME]!, {
        0: teamDisplayName(ctx.teamA),
        3: teamDisplayName(ctx.teamB),
    });

    const playersA = padPlayers(ctx.teamA.players);
    const playersB = padPlayers(ctx.teamB.players);

    for (let i = 0; i < ACTA_TEMPLATE_PLAYER_ROWS; i++) {
        const a = playersA[i]!;
        const b = playersB[i]!;
        const rowA = ROW.TEAM_A_PLAYER_FIRST + i;
        const rowB = ROW.TEAM_B_PLAYER_FIRST + i;
        if (rows[rowA]) {
            rows[rowA] = setPlayerRowCells(rows[rowA], a.number, a.name);
        }
        if (rows[rowB]) {
            rows[rowB] = setPlayerRowCells(rows[rowB], b.number, b.name);
        }
    }

    const filledTable = joinTableRows('<w:tbl>', rows) + '</w:tbl>';
    return enforceSinglePageLayout(before + filledTable + after);
}

function fillHeaderTitle(headerXml: string, title: string): string {
    const safe = escapeXmlText(title);
    if (headerXml.includes('MUSKIZKO UDALA BALONMANO PLAYA')) {
        return headerXml.replace(
            /II MUSKIZKO UDALA BALONMANO PLAYA\s*/g,
            `${safe} `
        );
    }
    return headerXml;
}

/** Carga la plantilla DOCX y rellena datos del partido conservando diseño y logos. */
export async function fillActaTemplateBlob(ctx: ActaExportContext, templateBytes: ArrayBuffer): Promise<Blob> {
    const zip = await JSZip.loadAsync(templateBytes);

    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('Plantilla acta inválida: falta word/document.xml');

    let docXml = await docFile.async('string');
    docXml = fillDocumentTable(docXml, ctx);
    zip.file('word/document.xml', docXml);

    const headerFile = zip.file('word/header1.xml');
    if (headerFile) {
        let headerXml = await headerFile.async('string');
        headerXml = fillHeaderTitle(headerXml, ctx.competitionName);
        zip.file('word/header1.xml', headerXml);
    }

    const out = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
    });
    return out;
}

export async function fetchActaTemplateBytes(): Promise<ArrayBuffer> {
    const res = await fetch(ACTA_TEMPLATE_URL);
    if (!res.ok) {
        throw new Error(`No se pudo cargar la plantilla del acta (${res.status}). Comprueba ${ACTA_TEMPLATE_URL}`);
    }
    return res.arrayBuffer();
}
