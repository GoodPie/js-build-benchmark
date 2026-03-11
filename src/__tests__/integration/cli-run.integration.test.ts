import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const FIXTURES_DIR = path.resolve(import.meta.dir, "../fixtures");
const INDEX_TS = path.resolve(import.meta.dir, "../../../index.ts");

function runCLI(args: string[], options: { cwd?: string } = {}) {
    return spawnSync("bun", ["run", INDEX_TS, ...args], {
        encoding: "utf8",
        cwd: options.cwd ?? process.cwd(),
        timeout: 30_000,
    });
}

/**
 * Write an inline config object to a unique temp file, call fn with its path,
 * then delete the file regardless of whether fn throws.
 */
function withTempConfig(config: object, fn: (configPath: string) => void): void {
    const p = path.join(os.tmpdir(), `bench-config-${crypto.randomUUID()}.json`);
    fs.writeFileSync(p, JSON.stringify(config), "utf8");
    try {
        fn(p);
    } finally {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
}

// ─── Success cases ────────────────────────────────────────────────────────────

describe("CLI run command - success", () => {
    test("exits with code 0 for a valid config", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.status).toBe(0);
    });

    test("stdout contains BENCHMARK SUMMARY section", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.stdout).toContain("BENCHMARK SUMMARY");
    });

    test("stdout contains SYSTEM INFO section", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.stdout).toContain("SYSTEM INFO");
    });

    test("stdout contains the tool name uppercased in the summary", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.stdout).toContain("ECHO-TOOL:");
    });

    test("stdout contains Build time (s) line in summary", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.stdout).toContain("Build time (s):");
    });

    test("stdout contains Memory usage (MB) line in summary", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.stdout).toContain("Memory usage (MB):");
    });

    test("stdout contains benchmarking header for the tool", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.stdout).toContain("Benchmarking echo-tool");
    });

    test("exits with code 0 for warm cacheMode config", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.warm.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.status).toBe(0);
    });

    test("exits with code 0 for both cacheMode config", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.both.config.json");
        const result = runCLI(["run", "--file", configPath]);
        expect(result.status).toBe(0);
    });

    test("--iterations flag overrides config and exits 0", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--iterations", "1"]);
        expect(result.status).toBe(0);
    });

    test("--cache-mode warm flag overrides config and produces warm runs", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--cache-mode", "warm"]);
        expect(result.status).toBe(0);
        // With warm mode the reporter prints "Warm:" group label
        expect(result.stdout).toContain("Warm:");
    });

    test("--warmup flag enables warmup run and exits 0", () => {
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--warmup"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Warmup run");
    });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe("CLI run command - error handling", () => {
    test("exits with code 1 when config file does not exist", () => {
        const result = runCLI(["run", "--file", "/nonexistent/path/benchmark.config.json"]);
        expect(result.status).toBe(1);
    });

    test("stderr contains 'Configuration file not found' for missing config", () => {
        const result = runCLI(["run", "--file", "/nonexistent/path/benchmark.config.json"]);
        expect(result.stderr).toContain("Configuration file not found");
    });

    test("exits with code 1 for invalid JSON in config file", () => {
        withTempConfig("{ this is not valid json }" as unknown as object, (configPath) => {
            // Write raw invalid JSON directly
            fs.writeFileSync(configPath, "{ this is not valid json }", "utf8");
            const result = runCLI(["run", "--file", configPath]);
            expect(result.status).toBe(1);
        });
    });

    test("stderr contains 'Error running benchmark' for invalid JSON", () => {
        withTempConfig({} as object, (configPath) => {
            fs.writeFileSync(configPath, "{ bad json }", "utf8");
            const result = runCLI(["run", "--file", configPath]);
            expect(result.stderr).toContain("Error running benchmark");
        });
    });

    test("exits with code 1 for valid JSON failing Zod validation (missing tools)", () => {
        withTempConfig({ iterations: 2 }, (configPath) => {
            const result = runCLI(["run", "--file", configPath]);
            expect(result.status).toBe(1);
        });
    });

    test("stderr contains 'Error running benchmark' for Zod validation failure", () => {
        withTempConfig({ iterations: 2 }, (configPath) => {
            const result = runCLI(["run", "--file", configPath]);
            expect(result.stderr).toContain("Error running benchmark");
        });
    });

    test("exits with code 1 for an invalid cacheMode value", () => {
        withTempConfig({
            iterations: 2,
            cacheMode: "never",
            tools: [{ name: "echo-tool", command: "echo built" }],
        }, (configPath) => {
            const result = runCLI(["run", "--file", configPath]);
            expect(result.status).toBe(1);
        });
    });

    test("exits with code 1 for an empty tools array", () => {
        withTempConfig({ iterations: 2, cacheMode: "cold", tools: [] }, (configPath) => {
            const result = runCLI(["run", "--file", configPath]);
            expect(result.status).toBe(1);
        });
    });

    test("continues and exits 0 when the build command does not exist (graceful recovery)", () => {
        // The Benchmarker catches per-iteration errors and continues — all iterations may fail
        // but the process still exits 0. The failure appears in stderr per iteration.
        // If a future refactor changes this behaviour, this test will signal the contract change.
        withTempConfig({
            iterations: 1,
            cacheMode: "cold",
            tools: [{ name: "nonexistent", command: "this-command-does-not-exist-at-all" }],
        }, (configPath) => {
            const result = runCLI(["run", "--file", configPath]);
            expect(result.status).toBe(0);
            // Per-iteration error surfaced in stderr
            expect(result.stderr).toContain("Error running nonexistent");
            // Summary section still printed — confirms graceful degradation
            expect(result.stdout).toContain("BENCHMARK SUMMARY");
        });
    });
});

// ─── Default config file resolution ──────────────────────────────────────────

describe("CLI run command - default config resolution", () => {
    test("uses benchmark.config.json by default when run from the fixtures directory", () => {
        // Run without --file; cwd is the fixtures dir which contains benchmark.config.json
        const result = runCLI(["run"], { cwd: FIXTURES_DIR });
        expect(result.status).toBe(0);
    });
});
