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

type ActaCellKind = 'meta' | 'team' | 'name' | 'number';

const ACTA_CELL_LIMITS: Record<ActaCellKind, number> = {
    meta: 48,
    team: 52,
    name: 42,
    number: 3,
};

/** Tamaño en half-points (Word): 12=6pt … 16=8pt. Mínimo legible en pantalla. */
function fontHalfPoints(text: string, kind: ActaCellKind): string {
    const len = text.length;
    if (kind === 'number') return '16';

    if (kind === 'team') {
        if (len > 35) return '18';
        if (len > 25) return '20';
        if (len > 18) return '22';
        return '24';
    }

    if (kind === 'name') {
        if (len > 36) return '11';
        if (len > 28) return '12';
        if (len > 22) return '13';
        if (len > 16) return '14';
        return '16';
    }

    if (len > 36) return '12';
    if (len > 26) return '13';
    if (len > 18) return '14';
    return '16';
}

function fitCellText(text: string, kind: ActaCellKind): string {
    const trimmed = text.trim();
    const max = ACTA_CELL_LIMITS[kind];
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1)}…`;
}

function compactParagraph(text: string, opts?: { center?: boolean; kind?: ActaCellKind }): string {
    const kind = opts?.kind ?? 'meta';
    const fitted = fitCellText(text, kind);
    const safe = escapeXmlText(fitted);
    const jc = opts?.center ? 'center' : 'left';
    const sz = fontHalfPoints(fitted, kind);
    const run = `<w:r><w:rPr><w:color w:val="000000"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r>`;
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${run}</w:p>`;
}

function setCellContent(tcXml: string, text: string, opts?: { center?: boolean; kind?: ActaCellKind }): string {
    if (!text) return tcXml;
    const paragraph = compactParagraph(text, opts);
    const tcPrClose = tcXml.indexOf('</w:tcPr>');
    if (tcPrClose >= 0) {
        return `${tcXml.slice(0, tcPrClose + '</w:tcPr>'.length)}${paragraph}</w:tc>`;
    }
    const open = tcXml.match(/^<w:tc(?:\s[^>]*)?>/)?.[0];
    if (open) return `${open}${paragraph}</w:tc>`;
    return tcXml;
}

function setPlayerRowCells(rowXml: string, number: string, name: string): string {
    const { cells, starts, ends } = splitRowCells(rowXml);
    let out = rowXml;
    const patches: [number, string, { center?: boolean; kind: ActaCellKind }][] = [
        [1, name, { kind: 'name' }],
        [0, number, { center: true, kind: 'number' }],
    ];
    for (const [col, text, cellOpts] of patches) {
        if (col >= cells.length || !text) continue;
        const updated = setCellContent(cells[col]!, text, cellOpts);
        out = out.slice(0, starts[col]!) + updated + out.slice(ends[col]!);
    }
    return out;
}

function setRowCellTexts(
    rowXml: string,
    assignments: Record<number, { text: string; kind?: ActaCellKind; center?: boolean } | string>
): string {
    const { cells, starts, ends } = splitRowCells(rowXml);
    let out = rowXml;
    const ordered = Object.entries(assignments)
        .map(([k, v]) => {
            if (typeof v === 'string') return [Number(k), { text: v, kind: 'meta' as const }] as const;
            return [Number(k), v] as const;
        })
        .sort((a, b) => b[0] - a[0]);
    for (const [col, { text, kind, center }] of ordered) {
        if (col < 0 || col >= cells.length || !text) continue;
        const updated = setCellContent(cells[col]!, text, { kind: kind ?? 'meta', center });
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

function blankPlayerRow(rowXml: string): string {
    return setPlayerRowCells(rowXml, '', '');
}

function ensurePlayerRowSlots(
    rows: string[],
    firstRowIdx: number,
    staffRowIdx: number,
    playerCount: number,
): number {
    const slots = staffRowIdx - firstRowIdx;
    if (playerCount <= slots) return staffRowIdx;
    const templateRow = rows[staffRowIdx - 1] ?? rows[firstRowIdx];
    if (!templateRow) return staffRowIdx;
    for (let i = 0; i < playerCount - slots; i++) {
        rows.splice(staffRowIdx, 0, blankPlayerRow(templateRow));
        staffRowIdx++;
    }
    return staffRowIdx;
}

function teamDisplayName(block: ActaExportContext['teamA']): string {
    return (block.name ?? '').trim();
}

/** Comprime filas y márgenes para que el acta quepa en 1 sola hoja A4. */
function enforceSinglePageLayout(xml: string): string {
    let out = xml;

    // El modelo trae 2 columnas de ~0,5″: Word parte el acta en 2 páginas y el texto no se lee.
    out = out.replace(/<w:cols[\s\S]*?<\/w:cols>/g, '');

    out = out.replace(
        /<w:pgMar[^/>]*\/>/g,
        '<w:pgMar w:bottom="120" w:top="220" w:left="340" w:right="340" w:header="180" w:footer="120"/>'
    );

    out = out.replace(/<w:trHeight w:val="(\d+)" w:hRule="(?:atLeast|exact)"\/>/g, (_m, raw) => {
        const v = Math.max(120, Math.round(Number(raw) * 0.78));
        return `<w:trHeight w:val="${v}" w:hRule="exact"/>`;
    });

    out = out.replace(/<w:cantSplit w:val="0"\/>/g, '<w:cantSplit w:val="1"/>');

    return out;
}

function cleanupAfterTable(after: string): string {
    return after
        .replace(/<w:p[^>]*>[\s\S]*?<\/w:p>\s*(?=<w:sectPr)/, '')
        .replace(/<w:sectPr><w:type w:val="continuous"[\s\S]*?<\/w:sectPr>/, '');
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
        0: { text: ctx.competitionName, kind: 'meta' },
        1: { text: ctx.category, kind: 'meta' },
        2: { text: ctx.gender, kind: 'meta' },
        3: { text: ctx.phase, kind: 'meta' },
        4: { text: ctx.group, kind: 'meta', center: true },
    });

    rows[ROW.MATCH_VALUES] = setRowCellTexts(rows[ROW.MATCH_VALUES]!, {
        1: { text: ctx.scheduleDay, kind: 'meta' },
        2: { text: ctx.time, kind: 'meta', center: true },
        3: { text: ctx.court, kind: 'meta' },
    });

    rows[ROW.TEAM_A_NAME] = setRowCellTexts(rows[ROW.TEAM_A_NAME]!, {
        0: { text: teamDisplayName(ctx.teamA), kind: 'team' },
        3: { text: teamDisplayName(ctx.teamB), kind: 'team' },
    });

    const playersA = ctx.teamA.players;
    const playersB = ctx.teamB.players;

    const TEAM_A_STAFF = 24;
    const TEAM_B_STAFF = 31;
    let staffAIdx = TEAM_A_STAFF;
    staffAIdx = ensurePlayerRowSlots(rows, ROW.TEAM_A_PLAYER_FIRST, staffAIdx, playersA.length);
    const shiftA = staffAIdx - TEAM_A_STAFF;

    for (let i = 0; i < playersA.length; i++) {
        const rowA = ROW.TEAM_A_PLAYER_FIRST + i;
        const p = playersA[i]!;
        if (rows[rowA]) rows[rowA] = setPlayerRowCells(rows[rowA], p.number, p.name);
    }

    const teamBFirst = ROW.TEAM_B_PLAYER_FIRST + shiftA;
    let staffBIdx = TEAM_B_STAFF + shiftA;
    staffBIdx = ensurePlayerRowSlots(rows, teamBFirst, staffBIdx, playersB.length);

    for (let i = 0; i < playersB.length; i++) {
        const rowB = teamBFirst + i;
        const p = playersB[i]!;
        if (rows[rowB]) rows[rowB] = setPlayerRowCells(rows[rowB], p.number, p.name);
    }

    const filledTable = joinTableRows('<w:tbl>', rows) + '</w:tbl>';
    return enforceSinglePageLayout(before + filledTable + cleanupAfterTable(after));
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

    const settingsFile = zip.file('word/settings.xml');
    if (settingsFile) {
        let settingsXml = await settingsFile.async('string');
        if (!settingsXml.includes('w:print')) {
            settingsXml = settingsXml.replace(
                '</w:settings>',
                '<w:print><w:scalePaper w:val="95"/></w:print></w:settings>'
            );
        }
        zip.file('word/settings.xml', settingsXml);
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
