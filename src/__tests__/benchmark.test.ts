import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import type { BenchmarkConfig, BuildToolConfig, BuildStats } from "../types";

// ─── Module mocks (must be declared before any import of the module under test) ───
//
// spawnSync is the only child_process export used by benchmark.ts.
// The return shape must match SpawnSyncReturns<string>:
//   { pid, status, signal, output, stdout, stderr, error }
// Tests override this per-call with mockImplementationOnce / mockReturnValueOnce.

const spawnSyncMock = mock((_cmd: string, _args?: string[], _opts?: object) => ({
    pid: 1,
    status: 0,
    signal: null,
    output: [null, "", ""],
    stdout: "",
    stderr: "",
    error: undefined,
}));

const existsSyncMock = mock((_path: string): boolean => true);
const rmSyncMock = mock((_path: string, _opts?: object): void => undefined);
const readdirSyncMock = mock((_path: string): string[] => []);
const statSyncMock = mock((_path: string) => ({ isDirectory: () => false, size: 1024 }));

mock.module("child_process", () => ({
    spawnSync: spawnSyncMock,
}));

mock.module("fs", () => ({
    existsSync: existsSyncMock,
    rmSync: rmSyncMock,
    readdirSync: readdirSyncMock,
    statSync: statSyncMock,
}));

// Strip chalk formatting so assertions on console output are plain strings
mock.module("chalk", () => ({
    default: new Proxy(
        {},
        {
            get: () => {
                const fn = (s: unknown) => String(s);
                return new Proxy(fn, {
                    get: () => (s: unknown) => String(s),
                });
            },
        }
    ),
}));

// Dynamic import AFTER all mock.module() calls
const { Benchmarker } = await import("../benchmark");

// ─── Test subclass ─────────────────────────────────────────────────────────────
//
// Benchmarker's internal methods are `protected` so that this subclass can expose
// them for unit testing without requiring `as any` casts. TypeScript enforces the
// exact signatures, so any drift in the source will produce a compile error here.

class TestableBenchmarker extends Benchmarker {
    exposedCalculateStats(arr: number[]): BuildStats {
        return this.calculateStats(arr);
    }

    exposedGetBuildSize(outputDir: string): number {
        return this.getBuildSize(outputDir);
    }

    exposedClearCache(tool: BuildToolConfig): void {
        return this.clearCache(tool);
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** A spawnSync return value representing a successful run with no output. */
function makeSpawnSuccess(stdout = "", stderr = "") {
    return {
        pid: 1,
        status: 0,
        signal: null,
        output: [null, stdout, stderr],
        stdout,
        stderr,
        error: undefined,
    };
}

/** A spawnSync return value representing a failed run (non-zero exit). */
function makeSpawnFailure(status = 1, stderr = "") {
    return {
        pid: 1,
        status,
        signal: null,
        output: [null, "", stderr],
        stdout: "",
        stderr,
        error: undefined,
    };
}

/** A spawnSync return value representing a spawn error (e.g. ENOENT). */
function makeSpawnError(message = "spawn error") {
    return {
        pid: 0,
        status: null,
        signal: null,
        output: [null, "", ""],
        stdout: "",
        stderr: "",
        error: new Error(message),
    };
}

const minimalConfig: BenchmarkConfig = {
    iterations: 1,
    clearCache: false,
    warmup: false,
    tools: [{ name: "esbuild", command: "esbuild --bundle" }],
};

// ─── calculateStats ────────────────────────────────────────────────────────────

describe("Benchmarker.calculateStats", () => {
    let b: TestableBenchmarker;

    beforeEach(() => {
        b = new TestableBenchmarker(minimalConfig);
    });

    test("returns correct avg, min, max for a standard array", () => {
        const stats = b.exposedCalculateStats([1, 2, 3, 4, 5]);
        expect(stats.avg).toBe("3.00");
        expect(stats.min).toBe("1.00");
        expect(stats.max).toBe("5.00");
    });

    test("returns correct values for a single-element array", () => {
        const stats = b.exposedCalculateStats([42]);
        expect(stats.avg).toBe("42.00");
        expect(stats.min).toBe("42.00");
        expect(stats.max).toBe("42.00");
    });

    test("formats results to 2 decimal places", () => {
        const stats = b.exposedCalculateStats([1, 2]);
        expect(stats.avg).toBe("1.50");
        expect(stats.min).toBe("1.00");
        expect(stats.max).toBe("2.00");
    });

    test("handles identical values", () => {
        const stats = b.exposedCalculateStats([7, 7, 7]);
        expect(stats.avg).toBe("7.00");
        expect(stats.min).toBe("7.00");
        expect(stats.max).toBe("7.00");
    });

    test("returns strings, not numbers", () => {
        const stats = b.exposedCalculateStats([5]);
        expect(typeof stats.avg).toBe("string");
        expect(typeof stats.min).toBe("string");
        expect(typeof stats.max).toBe("string");
    });

    test("handles floating-point inputs", () => {
        const stats = b.exposedCalculateStats([1.5, 2.5, 3.0]);
        expect(stats.avg).toBe("2.33");
        expect(stats.min).toBe("1.50");
        expect(stats.max).toBe("3.00");
    });

    // Document the invariant: printSummary guards with `length > 0` before calling
    // calculateStats, so an empty array never reaches it in production.
    test("empty array is never passed in production (printSummary guards with length > 0)", async () => {
        const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        const consoleErrSpy = spyOn(console, "error").mockImplementation(() => {});
        spawnSyncMock.mockReturnValue(makeSpawnFailure(1));

        const config: BenchmarkConfig = {
            iterations: 1,
            clearCache: false,
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        };
        const benchmarker = new Benchmarker(config);
        const results = await benchmarker.run();
        // All iterations failed — results array is empty
        expect(results["esbuild"]).toHaveLength(0);
        // calculateStats was not called with the empty array (no throw)
        consoleSpy.mockRestore();
        consoleErrSpy.mockRestore();
    });
});

// ─── getBuildSize ──────────────────────────────────────────────────────────────

describe("Benchmarker.getBuildSize", () => {
    let b: TestableBenchmarker;
    let consoleSpy: ReturnType<typeof spyOn>;
    let consoleErrSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        b = new TestableBenchmarker(minimalConfig);
        consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrSpy = spyOn(console, "error").mockImplementation(() => {});
        spawnSyncMock.mockClear();
        existsSyncMock.mockClear();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        consoleErrSpy.mockRestore();
    });

    test("returns 0 when output directory does not exist", () => {
        existsSyncMock.mockImplementationOnce(() => false);
        const size = b.exposedGetBuildSize("/some/missing/dir");
        expect(size).toBe(0);
        expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    test.skipIf(process.platform === "win32")(
        "calls spawnSync('du', ['-sk', outputDir]) on non-Windows",
        () => {
            existsSyncMock.mockImplementationOnce(() => true);
            // du -sk returns KB as a plain integer: "12288\t/path/to/dist"
            spawnSyncMock.mockReturnValueOnce(makeSpawnSuccess("12288\t/path/to/dist\n"));
            const size = b.exposedGetBuildSize("/path/to/dist");
            expect(spawnSyncMock).toHaveBeenCalledWith(
                "du",
                ["-sk", "/path/to/dist"],
                expect.any(Object)
            );
            // 12288 KB / 1024 = 12 MB
            expect(size).toBe(12);
        }
    );

    test.skipIf(process.platform === "win32")(
        "converts du -sk kilobytes output to megabytes",
        () => {
            existsSyncMock.mockImplementationOnce(() => true);
            // 2048 KB = 2 MB
            spawnSyncMock.mockReturnValueOnce(makeSpawnSuccess("2048\t/path/to/dist\n"));
            const size = b.exposedGetBuildSize("/path/to/dist");
            expect(size).toBe(2);
        }
    );

    test.skipIf(process.platform === "win32")(
        "returns 0 and logs a warning when du fails",
        () => {
            existsSyncMock.mockImplementationOnce(() => true);
            spawnSyncMock.mockReturnValueOnce(makeSpawnError("du: command not found"));
            const size = b.exposedGetBuildSize("/some/dir");
            expect(size).toBe(0);
        }
    );
});

// ─── clearCache ────────────────────────────────────────────────────────────────

describe("Benchmarker.clearCache", () => {
    let b: TestableBenchmarker;
    let consoleSpy: ReturnType<typeof spyOn>;
    let consoleErrSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        b = new TestableBenchmarker(minimalConfig);
        consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrSpy = spyOn(console, "error").mockImplementation(() => {});
        spawnSyncMock.mockClear();
        existsSyncMock.mockClear();
        rmSyncMock.mockClear();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        consoleErrSpy.mockRestore();
    });

    test("calls spawnSync with the parsed clearCacheCommand", () => {
        spawnSyncMock.mockReturnValueOnce(makeSpawnSuccess());
        b.exposedClearCache({
            name: "webpack",
            command: "webpack",
            clearCacheCommand: "rm -rf node_modules/.cache",
        });
        // splitCommand splits "rm -rf node_modules/.cache" → exe="rm", args=["-rf", "node_modules/.cache"]
        expect(spawnSyncMock).toHaveBeenCalledWith(
            "rm",
            ["-rf", "node_modules/.cache"],
            expect.any(Object)
        );
    });

    test("does not call spawnSync when no clearCacheCommand is provided", () => {
        b.exposedClearCache({ name: "esbuild", command: "esbuild --bundle" });
        expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    test("calls rmSync when clearCacheDir exists", () => {
        existsSyncMock.mockImplementationOnce(() => true);
        b.exposedClearCache({
            name: "webpack",
            command: "webpack",
            clearCacheDir: "node_modules/.cache/webpack",
        });
        expect(rmSyncMock).toHaveBeenCalledWith(
            expect.stringContaining("node_modules/.cache/webpack"),
            expect.objectContaining({ recursive: true, force: true })
        );
    });

    test("does not call rmSync when clearCacheDir does not exist", () => {
        existsSyncMock.mockImplementationOnce(() => false);
        b.exposedClearCache({
            name: "webpack",
            command: "webpack",
            clearCacheDir: "node_modules/.cache/webpack",
        });
        expect(rmSyncMock).not.toHaveBeenCalled();
    });

    test("does not throw when clearCacheCommand spawn fails (result.error set)", () => {
        spawnSyncMock.mockReturnValueOnce(makeSpawnError("ENOENT"));
        expect(() =>
            b.exposedClearCache({
                name: "webpack",
                command: "webpack",
                clearCacheCommand: "nonexistent-command",
            })
        ).not.toThrow();
    });
});

// ─── run() ─────────────────────────────────────────────────────────────────────

describe("Benchmarker.run", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let consoleErrSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrSpy = spyOn(console, "error").mockImplementation(() => {});
        spawnSyncMock.mockClear();
        existsSyncMock.mockClear();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        consoleErrSpy.mockRestore();
    });

    // Memory output format is platform-specific; skip the memory assertion on Windows
    // where memory measurement is not available.
    const macosMemoryOutput = "104857600 maximum resident set size\n"; // 100 MB in bytes (macOS format)

    test("returns results keyed by tool name", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            ...minimalConfig,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const results = await benchmarker.run();

        expect(results).toHaveProperty("esbuild");
    });

    test("runs the correct number of iterations", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 3,
            clearCache: false,
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const results = await benchmarker.run();

        expect(results["esbuild"]).toHaveLength(3);
    });

    test("returns results for multiple tools", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 1,
            clearCache: false,
            warmup: false,
            tools: [
                { name: "esbuild", command: "esbuild --bundle" },
                { name: "webpack", command: "webpack --mode production" },
            ],
        });
        const results = await benchmarker.run();

        expect(results).toHaveProperty("esbuild");
        expect(results).toHaveProperty("webpack");
    });

    test.skipIf(process.platform !== "darwin")(
        "parses macOS memory usage (bytes) from spawnSync stderr",
        async () => {
            // 104857600 bytes = 100 MB
            spawnSyncMock.mockReturnValue(makeSpawnSuccess("", "104857600 maximum resident set size\n"));
            existsSyncMock.mockReturnValue(false);

            const benchmarker = new Benchmarker({
                ...minimalConfig,
                tools: [{ name: "esbuild", command: "esbuild --bundle" }],
            });
            const results = await benchmarker.run();

            const result = results["esbuild"]?.[0];
            expect(result).toBeDefined();
            if (result) {
                expect(result.memoryUsage).toBeCloseTo(100, 0);
            }
        }
    );

    test.skipIf(process.platform !== "linux")(
        "parses Linux memory usage (KB) from spawnSync stderr",
        async () => {
            // 102400 KB = 100 MB
            spawnSyncMock.mockReturnValue(
                makeSpawnSuccess("", "Maximum resident set size (kbytes): 102400\n")
            );
            existsSyncMock.mockReturnValue(false);

            const benchmarker = new Benchmarker({
                ...minimalConfig,
                tools: [{ name: "esbuild", command: "esbuild --bundle" }],
            });
            const results = await benchmarker.run();

            const result = results["esbuild"]?.[0];
            expect(result).toBeDefined();
            if (result) {
                expect(result.memoryUsage).toBeCloseTo(100, 0);
            }
        }
    );

    test("handles failed build iterations gracefully and continues", async () => {
        // First call fails (non-zero exit), second call succeeds.
        // Using mockReturnValueOnce avoids coupling to how many total spawnSync
        // calls are made (which is platform-dependent: /usr/bin/time on Unix adds one).
        spawnSyncMock
            .mockReturnValueOnce(makeSpawnFailure(1, "build error"))
            .mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 2,
            clearCache: false,
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const results = await benchmarker.run();
        // 1 failed + 1 successful = 1 result
        expect(results["esbuild"]).toHaveLength(1);
    });

    test("records buildTime as a non-negative number", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            ...minimalConfig,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const results = await benchmarker.run();

        const result = results["esbuild"]?.[0];
        expect(result).toBeDefined();
        if (result) {
            expect(result.buildTime).toBeGreaterThanOrEqual(0);
        }
    });
});
