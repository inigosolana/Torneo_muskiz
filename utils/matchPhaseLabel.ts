/** Etiqueta corta de fase/ronda para celdas del calendario. */
export function getMatchPhaseDisplayLabel(round?: string): string {
    if (!round) return '';
    const r = round.trim();

    if (/grupos/i.test(r)) {
        const gm = /Grupos\s*·\s*([A-Z]{2}-[A-Z0-9]+)/i.exec(r);
        if (gm) return `Grupos · ${gm[1]}`;
        const gr = /Gr\.\s*([A-D])\b/i.exec(r);
        if (gr) return `Grupos · Gr. ${gr[1]!.toUpperCase()}`;
        return 'Fase de grupos';
    }
    if (/repesca|consolaci[oó]n/i.test(r)) return 'Repesca / consolación';
    if (/cuartos?/i.test(r)) {
        const tail = r.split('·').slice(2).join('·').trim();
        return tail ? `Cuartos · ${tail}` : 'Cuartos de final';
    }
    if (/semi/i.test(r)) {
        const tail = r.split('·').slice(2).join('·').trim();
        return tail ? `Semifinal · ${tail}` : 'Semifinal';
    }
    if (/3º|4º|tercer|puesto/i.test(r)) return '3º y 4º puesto';
    if (/\bfinal\b/i.test(r)) {
        const tail = r.split('·').slice(2).join('·').trim();
        return tail ? `Final · ${tail}` : 'Final';
    }

    const tail = r.split('·').slice(2).join('·').trim();
    return tail || r;
}
