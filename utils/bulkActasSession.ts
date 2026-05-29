import type { Match } from '../types';
import type { AdminPreviewMode } from './adminUiPersistence';

const STORAGE_KEY = 'torneo_bulk_actas_v1';

export interface BulkActasPayload {
    label: string;
    source: AdminPreviewMode;
    matches: Match[];
    savedAt: string;
}

export function saveBulkActasPayload(payload: BulkActasPayload): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        throw new Error('No se pudieron guardar los datos para las actas (límite del navegador).');
    }
}

export function loadBulkActasPayload(): BulkActasPayload | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as BulkActasPayload;
        if (!Array.isArray(data.matches)) return null;
        return data;
    } catch {
        return null;
    }
}

export function clearBulkActasPayload(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
