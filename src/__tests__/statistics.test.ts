import { describe, test, expect } from "bun:test";
import { calculateStats } from "../statistics";

describe("calculateStats", () => {
    test("returns correct avg, min, max for a standard array", () => {
        const stats = calculateStats([1, 2, 3, 4, 5]);
        expect(stats.avg).toBe(3);
        expect(stats.min).toBe(1);
        expect(stats.max).toBe(5);
    });

    test("returns correct values for a single-element array", () => {
        const stats = calculateStats([42]);
        expect(stats.avg).toBe(42);
        expect(stats.min).toBe(42);
        expect(stats.max).toBe(42);
    });

    test("returns exact fractional avg without rounding", () => {
        const stats = calculateStats([1, 2]);
        expect(stats.avg).toBe(1.5);
        expect(stats.min).toBe(1);
        expect(stats.max).toBe(2);
    });

    test("handles identical values", () => {
        const stats = calculateStats([7, 7, 7]);
        expect(stats.avg).toBe(7);
        expect(stats.min).toBe(7);
        expect(stats.max).toBe(7);
    });

    test("returns numbers, not strings", () => {
        const stats = calculateStats([5]);
        expect(typeof stats.avg).toBe("number");
        expect(typeof stats.min).toBe("number");
        expect(typeof stats.max).toBe("number");
    });

    test("handles floating-point inputs", () => {
        const stats = calculateStats([1.5, 2.5, 3.0]);
        expect(stats.avg).toBeCloseTo(2.333, 2);
        expect(stats.min).toBe(1.5);
        expect(stats.max).toBe(3.0);
    });

    test("throws on empty array", () => {
        expect(() => calculateStats([])).toThrow("calculateStats called with empty array");
    });
});
