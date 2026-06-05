import { useEffect, useState } from 'react';

/** Índice cíclico que avanza cada `intervalMs` (p. ej. carruseles de 3-5 s). */
export function useRotatingIndex(length: number, intervalMs = 5000, randomInitial = false): number {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (length <= 0) {
            setIndex(0);
            return;
        }
        if (length === 1) {
            setIndex(0);
            return;
        }
        if (randomInitial) {
            setIndex(Math.floor(Math.random() * length));
        } else {
            setIndex((i) => i % length);
        }
        const id = window.setInterval(() => {
            setIndex((i) => (i + 1) % length);
        }, intervalMs);
        return () => window.clearInterval(id);
    }, [length, intervalMs, randomInitial]);

    return length <= 0 ? 0 : index % length;
}
