import type { BuildStats } from './types.js';

/**
 * Computes avg, min, and max for a non-empty array of numbers.
 * Returns numbers — callers are responsible for formatting at display time.
 * Throws if the array is empty.
 */
export function calculateStats(arr: number[]): BuildStats {
    if (arr.length === 0) throw new Error('calculateStats called with empty array');
    const sum = arr.reduce((a, b) => a + b, 0);
    return {
        avg: sum / arr.length,
        min: Math.min(...arr),
        max: Math.max(...arr),
    };
}
