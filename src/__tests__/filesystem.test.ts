import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";

// ─── Module mocks ──────────────────────────────────────────────────────────────
//
// Must be declared before any import of the module under test.
// Mirrors the pattern used in benchmark.test.ts for consistency.

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
const readdirSyncMock = mock((_path: string): string[] => []);
const statSyncMock = mock((_path: string) => ({ isDirectory: () => false, size: 1024 }));

mock.module("child_process", () => ({
    spawnSync: spawnSyncMock,
}));

mock.module("fs", () => ({
    existsSync: existsSyncMock,
    readdirSync: readdirSyncMock,
    statSync: statSyncMock,
}));

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
const { getBuildSize, getFileCount } = await import("../filesystem");

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// ─── getBuildSize ──────────────────────────────────────────────────────────────

describe("getBuildSize", () => {
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

    test("returns 0 when output directory does not exist", () => {
        existsSyncMock.mockImplementationOnce(() => false);
        const size = getBuildSize("/some/missing/dir");
        expect(size).toBe(0);
        expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    test.skipIf(process.platform === "win32")(
        "calls spawnSync('du', ['-sk', outputDir]) on non-Windows",
        () => {
            existsSyncMock.mockImplementationOnce(() => true);
            // du -sk returns KB as a plain integer: "12288\t/path/to/dist"
            spawnSyncMock.mockReturnValueOnce(makeSpawnSuccess("12288\t/path/to/dist\n"));
            const size = getBuildSize("/path/to/dist");
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
            const size = getBuildSize("/path/to/dist");
            expect(size).toBe(2);
        }
    );

    test.skipIf(process.platform === "win32")(
        "returns 0 and logs a warning when du fails",
        () => {
            existsSyncMock.mockImplementationOnce(() => true);
            spawnSyncMock.mockReturnValueOnce(makeSpawnError("du: command not found"));
            const size = getBuildSize("/some/dir");
            expect(size).toBe(0);
        }
    );
});

// ─── getFileCount ──────────────────────────────────────────────────────────────

describe("getFileCount", () => {
    let consoleSpy: ReturnType<typeof spyOn>;
    let consoleErrSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrSpy = spyOn(console, "error").mockImplementation(() => {});
        existsSyncMock.mockClear();
        readdirSyncMock.mockClear();
        statSyncMock.mockClear();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        consoleErrSpy.mockRestore();
    });

    test("returns 0 when output directory does not exist", () => {
        existsSyncMock.mockImplementationOnce(() => false);
        const count = getFileCount("/some/missing/dir");
        expect(count).toBe(0);
    });

    test("returns file count for a flat directory", () => {
        existsSyncMock.mockImplementationOnce(() => true);
        readdirSyncMock.mockImplementationOnce(() => ["a.js", "b.js", "c.js"]);
        statSyncMock.mockImplementation(() => ({ isDirectory: () => false, size: 100 }));
        const count = getFileCount("/some/dir");
        expect(count).toBe(3);
    });

    test("returns 0 for an empty directory", () => {
        existsSyncMock.mockImplementationOnce(() => true);
        readdirSyncMock.mockImplementationOnce(() => []);
        const count = getFileCount("/some/dir");
        expect(count).toBe(0);
    });

    test("counts files recursively across nested directories", () => {
        existsSyncMock.mockImplementationOnce(() => true);

        // First readdirSync: top-level has a subdirectory and one file
        readdirSyncMock
            .mockImplementationOnce(() => ["subdir", "top.js"])
            .mockImplementationOnce(() => ["a.js", "b.js"]); // subdir contents

        // statSync: "subdir" is a directory, the rest are files
        statSyncMock
            .mockImplementationOnce(() => ({ isDirectory: () => true, size: 0 }))    // subdir
            .mockImplementationOnce(() => ({ isDirectory: () => false, size: 100 })) // top.js
            .mockImplementationOnce(() => ({ isDirectory: () => false, size: 100 })) // a.js
            .mockImplementationOnce(() => ({ isDirectory: () => false, size: 100 })); // b.js

        const count = getFileCount("/some/dir");
        // top.js + a.js + b.js = 3
        expect(count).toBe(3);
    });
});
