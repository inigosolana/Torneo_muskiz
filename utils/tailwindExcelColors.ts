/** Convierte clases Tailwind `bg-*` del calendario a RGB hex para Excel (sin #). */
const TAILWIND_BG_HEX: Record<string, string> = {
    'bg-slate-50': 'F8FAFC',
    'bg-pink-50': 'FDF2F8',
    'bg-pink-100': 'FCE7F3',
    'bg-pink-200': 'FBCFE8',
    'bg-pink-300': 'F9A8D4',
    'bg-blue-50': 'EFF6FF',
    'bg-blue-100': 'DBEAFE',
    'bg-blue-200': 'BFDBFE',
    'bg-blue-300': '93C5FD',
    'bg-rose-50': 'FFF1F2',
    'bg-rose-100': 'FFE4E6',
    'bg-rose-200': 'FECDD3',
    'bg-rose-300': 'FDA4AF',
    'bg-cyan-50': 'ECFEFF',
    'bg-cyan-100': 'CFFAFE',
    'bg-cyan-200': 'A5F3FC',
    'bg-cyan-300': '67E8F9',
    'bg-lime-50': 'F7FEE7',
    'bg-lime-100': 'ECFCCB',
    'bg-lime-200': 'D9F99D',
    'bg-green-100': 'DCFCE7',
    'bg-green-200': 'BBF7D0',
    'bg-green-300': '86EFAC',
    'bg-sky-50': 'F0F9FF',
    'bg-sky-100': 'E0F2FE',
    'bg-amber-100': 'FEF3C7',
    'bg-orange-100': 'FFEDD5',
    'bg-yellow-200': 'FEF08A',
    'bg-violet-100': 'EDE9FE',
    'bg-fuchsia-100': 'FAE8FF',
    'bg-indigo-200': 'C7D2FE',
};

export function tailwindBgToExcelRgb(cellClass: string): string {
    const token = cellClass.split(/\s+/).find((c) => c.startsWith('bg-'));
    if (!token) return TAILWIND_BG_HEX['bg-slate-50']!;
    const base = token.replace(/\/\d+$/, '');
    return TAILWIND_BG_HEX[base] ?? TAILWIND_BG_HEX['bg-slate-50']!;
}

export const EXCEL_PAUSE_LUNCH_RGB = '1E3A8A';
export const EXCEL_PAUSE_GAP_RGB = 'FEF3C7';
export const EXCEL_TIME_COL_RGB = 'F1F5F9';
export const EXCEL_BORDER_RGB = 'CBD5E1';
