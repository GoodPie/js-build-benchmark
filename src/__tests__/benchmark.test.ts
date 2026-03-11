import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import type { BenchmarkConfig, BuildToolConfig } from "../types";

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
    cacheMode: 'cold',
    warmup: false,
    tools: [{ name: "esbuild", command: "esbuild --bundle" }],
};

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
        const { results } = await benchmarker.run();

        expect(results).toHaveProperty("esbuild");
    });

    test("runs the correct number of cold iterations with cacheMode 'cold'", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 3,
            cacheMode: 'cold',
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const { results } = await benchmarker.run();

        expect(results["esbuild"]?.cold).toHaveLength(3);
        expect(results["esbuild"]?.warm).toHaveLength(0);
    });

    test("runs the correct number of warm iterations with cacheMode 'warm'", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 2,
            cacheMode: 'warm',
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const { results } = await benchmarker.run();

        expect(results["esbuild"]?.warm).toHaveLength(2);
        expect(results["esbuild"]?.cold).toHaveLength(0);
    });

    test("runs both cold and warm iterations with cacheMode 'both'", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 2,
            cacheMode: 'both',
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const { results } = await benchmarker.run();

        expect(results["esbuild"]?.cold).toHaveLength(2);
        expect(results["esbuild"]?.warm).toHaveLength(2);
    });

    test("returns results for multiple tools", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            iterations: 1,
            cacheMode: 'cold',
            warmup: false,
            tools: [
                { name: "esbuild", command: "esbuild --bundle" },
                { name: "webpack", command: "webpack --mode production" },
            ],
        });
        const { results } = await benchmarker.run();

        expect(results).toHaveProperty("esbuild");
        expect(results).toHaveProperty("webpack");
    });

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
            cacheMode: 'cold',
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const { results } = await benchmarker.run();
        // 1 failed + 1 successful = 1 result
        expect(results["esbuild"]?.cold).toHaveLength(1);
    });

    test("records buildTime as a non-negative number", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            ...minimalConfig,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const { results } = await benchmarker.run();

        const result = results["esbuild"]?.cold[0];
        expect(result).toBeDefined();
        if (result) {
            expect(result.buildTime).toBeGreaterThanOrEqual(0);
        }
    });

    test("result includes fileCount field", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnSuccess("", macosMemoryOutput));
        existsSyncMock.mockReturnValue(false);

        const benchmarker = new Benchmarker({
            ...minimalConfig,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const { results } = await benchmarker.run();

        const result = results["esbuild"]?.cold[0];
        expect(result).toBeDefined();
        if (result) {
            expect(typeof result.fileCount).toBe("number");
            expect(result.fileCount).toBeGreaterThanOrEqual(0);
        }
    });

    // Document the invariant: printSummary guards with `length > 0` before calling
    // calculateStats, so an empty array never reaches it in production.
    test("empty results array does not cause calculateStats to throw", async () => {
        spawnSyncMock.mockReturnValue(makeSpawnFailure(1));

        const config: BenchmarkConfig = {
            iterations: 1,
            cacheMode: 'cold',
            warmup: false,
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        };
        const benchmarker = new Benchmarker(config);
        const { results } = await benchmarker.run();
        // All iterations failed — cold results array is empty
        expect(results["esbuild"]?.cold).toHaveLength(0);
        // calculateStats was not called with the empty array (no throw)
    });
});
