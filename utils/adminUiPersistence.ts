const STORAGE_KEY = 'torneo_admin_ui_v1';

export type AdminMainTab = 'verification' | 'teamRoster' | 'competition' | 'teams' | 'sponsors' | 'categories';
export type AdminCompSubTab = 'structure' | 'simulations' | 'calendar' | 'results' | 'standings';
export type AdminPreviewMode = 'official' | 'simulation';

export interface AdminUiPersistedState {
    activeTab?: AdminMainTab;
    compSubTab?: AdminCompSubTab;
    /** Simulación vs Oficial en Competición */
    compPreviewMode?: AdminPreviewMode;
    compArenaMode?: AdminPreviewMode;
    /** Borrador concreto o «all» en vistas simulación */
    simulationViewDraftId?: string | 'all';
    structureDivision?: string;
    standingsDivision?: string;
}

export function loadAdminUiState(): AdminUiPersistedState {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as AdminUiPersistedState;
    } catch {
        return {};
    }
}

export function saveAdminUiState(patch: AdminUiPersistedState): void {
    try {
        const prev = loadAdminUiState();
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch {
        /* quota / private mode */
    }
}
