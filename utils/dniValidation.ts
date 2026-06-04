import type { Player } from '../types';

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Normaliza DNI/NIE: mayúsculas, sin espacios ni guiones. */
export function normalizeDniInput(dni: string | undefined | null): string {
    return String(dni ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]/g, '');
}

/** DNI (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra) con letra de control correcta. */
export function isValidSpanishDniOrNie(raw: string | undefined | null): boolean {
    const id = normalizeDniInput(raw);
    if (!id) return false;

    const nieMatch = /^([XYZ])(\d{7})([A-Z])$/.exec(id);
    if (nieMatch) {
        const prefix = nieMatch[1] === 'X' ? '0' : nieMatch[1] === 'Y' ? '1' : '2';
        const num = parseInt(prefix + nieMatch[2], 10);
        return DNI_LETTERS[num % 23] === nieMatch[3];
    }

    const dniMatch = /^(\d{8})([A-Z])$/.exec(id);
    if (!dniMatch) return false;
    const num = parseInt(dniMatch[1], 10);
    return DNI_LETTERS[num % 23] === dniMatch[2];
}

/**
 * Estado de revisión del DNI según el número introducido.
 * - Vacío → EMPTY
 * - DNI/NIE válido → APPROVED (sin revisión manual)
 * - Rechazo manual: se mantiene REJECTED hasta que cambien el número
 * - Resto → PENDING
 */
export function resolveDniStatusFromNumber(
    dniNumber: string | undefined | null,
    previousStatus?: Player['dniStatus'] | string | null,
    previousDniNumber?: string | undefined | null,
): Player['dniStatus'] {
    const normalized = normalizeDniInput(dniNumber);
    const prevNorm = normalizeDniInput(previousDniNumber);
    if (!normalized) return 'EMPTY';

    const valid = isValidSpanishDniOrNie(normalized);
    const dniChanged = normalized !== prevNorm;

    if (valid && (previousStatus !== 'REJECTED' || dniChanged)) return 'APPROVED';
    if (previousStatus === 'REJECTED') return 'REJECTED';
    if (valid) return 'APPROVED';
    return 'PENDING';
}
