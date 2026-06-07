import type { Team } from '../types';

/** Equipo dado de baja: se oculta en calendario/resultados públicos aunque siga approved en BD. */
export interface WithdrawnTeamSpec {
    id?: string;
    name: string;
    division: Team['division'];
}

/** Bajas confirmadas (domingo 2026): Astillero infantil. */
export const TOURNAMENT_WITHDRAWN_TEAMS: WithdrawnTeamSpec[] = [
    {
        id: '555414c0-fd48-4446-8b2a-0f64c6f08ccf',
        name: 'ASTILLERO BLUES',
        division: 'Infantil Masculino',
    },
    {
        id: '66493b59-e1ab-4168-ba91-153d57ea297c',
        name: 'ASTILLERO BLUES',
        division: 'Infantil Femenino',
    },
];
