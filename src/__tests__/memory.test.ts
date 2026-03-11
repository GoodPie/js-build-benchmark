import { describe, test, expect } from "bun:test";
import { parseMemoryUsage, getTimeArgs } from "../memory";

describe("parseMemoryUsage", () => {
    test("parses macOS format (bytes) regardless of host platform", () => {
        // 104857600 bytes = 100 MB
        const output = "104857600 maximum resident set size\n";
        expect(parseMemoryUsage(output, 'darwin')).toBeCloseTo(100, 0);
    });

    test("parses Linux format (kbytes) regardless of host platform", () => {
        // 102400 KB = 100 MB
        const output = "Maximum resident set size (kbytes): 102400\n";
        expect(parseMemoryUsage(output, 'linux')).toBeCloseTo(100, 0);
    });

    test("returns 0 for windows platform", () => {
        expect(parseMemoryUsage("anything", 'win32')).toBe(0);
    });

    test("returns null when output does not match macOS pattern", () => {
        expect(parseMemoryUsage("no match here", 'darwin')).toBeNull();
    });

    test("returns null when output does not match Linux pattern", () => {
        expect(parseMemoryUsage("no match here", 'linux')).toBeNull();
    });

    test("macOS: converts bytes to MB correctly", () => {
        // 1 GB = 1073741824 bytes
        const output = "1073741824 maximum resident set size\n";
        expect(parseMemoryUsage(output, 'darwin')).toBeCloseTo(1024, 0);
    });

    test("linux: converts KB to MB correctly", () => {
        // 512 MB = 524288 KB
        const output = "Maximum resident set size (kbytes): 524288\n";
        expect(parseMemoryUsage(output, 'linux')).toBeCloseTo(512, 0);
    });
});

describe("getTimeArgs", () => {
    test("returns null for win32", () => {
        expect(getTimeArgs('win32')).toBeNull();
    });

    test("returns -l flag for darwin", () => {
        const args = getTimeArgs('darwin');
        expect(args).toEqual(['/usr/bin/time', '-l']);
    });

    test("returns -v flag for linux", () => {
        const args = getTimeArgs('linux');
        expect(args).toEqual(['/usr/bin/time', '-v']);
    });
});
