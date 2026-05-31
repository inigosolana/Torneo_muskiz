import { Team } from '../types';

export interface CategoryRow {
  name: string;
  max_teams: number;
}

export interface RegistrationCapacitySummary {
  totalMax: number;
  totalUsed: number;
  totalRemaining: number;
  fillRatio: number;
  scarceCategories: { name: string; remaining: number }[];
  fewSpots: boolean;
}

export function summarizeRegistrationCapacity(
  teams: Team[],
  categories: CategoryRow[],
): RegistrationCapacitySummary {
  if (!categories.length) {
    return {
      totalMax: 0,
      totalUsed: 0,
      totalRemaining: 0,
      fillRatio: 0,
      scarceCategories: [],
      fewSpots: true,
    };
  }

  const activeTeams = teams.filter((t) => t.paymentStatus !== 'EXPIRED');
  let totalMax = 0;
  let totalUsed = 0;
  const scarceCategories: { name: string; remaining: number }[] = [];

  for (const cat of categories) {
    const max = Number(cat.max_teams) || 0;
    const used = activeTeams.filter((t) => t.division === cat.name).length;
    const remaining = Math.max(max - used, 0);
    totalMax += max;
    totalUsed += used;
    if (remaining <= 2 && max > 0) {
      scarceCategories.push({ name: cat.name, remaining });
    }
  }

  const totalRemaining = Math.max(totalMax - totalUsed, 0);
  const fillRatio = totalMax > 0 ? totalUsed / totalMax : 0;
  const fewSpots =
    totalRemaining <= 12 ||
    fillRatio >= 0.75 ||
    scarceCategories.length >= 2;

  return {
    totalMax,
    totalUsed,
    totalRemaining,
    fillRatio,
    scarceCategories,
    fewSpots,
  };
}

export function capacityUrgencyMessage(summary: RegistrationCapacitySummary): string {
  if (summary.totalMax === 0) {
    return 'Plazas muy limitadas — inscríbete cuanto antes';
  }
  if (summary.totalRemaining <= 0) {
    return 'Últimas plazas agotándose — revisa categorías al inscribirte';
  }
  if (summary.totalRemaining <= 6) {
    return `¡Solo quedan ${summary.totalRemaining} plaza${summary.totalRemaining === 1 ? '' : 's'}!`;
  }
  if (summary.fewSpots) {
    return `Quedan pocas plazas (${summary.totalRemaining} disponibles en total)`;
  }
  return `Plazas limitadas (${summary.totalRemaining} de ${summary.totalMax} libres)`;
}
