import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const FIXTURES_DIR = path.resolve(import.meta.dir, "../fixtures");
const INDEX_TS = path.resolve(import.meta.dir, "../../../index.ts");

function runCLI(args: string[]) {
    return spawnSync("bun", ["run", INDEX_TS, ...args], {
        encoding: "utf8",
        timeout: 30_000,
    });
}

// Fresh array per test — safe under --concurrency and parallel runs.
let tempFiles: string[] = [];

beforeEach(() => { tempFiles = []; });

afterEach(() => {
    for (const p of tempFiles) {
        try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
            // Ignore cleanup errors — they don't affect test correctness
        }
    }
    tempFiles = [];
});

/** Allocate a unique temp path for a report file and register it for cleanup. */
function tempOutput(suffix = "") {
    const p = path.join(os.tmpdir(), `bench-report${suffix}-${crypto.randomUUID()}.json`);
    tempFiles.push(p);
    return p;
}

/** Write an inline config object to a unique temp file and register it for cleanup. */
function writeTempConfig(config: object): string {
    const p = path.join(os.tmpdir(), `bench-config-${crypto.randomUUID()}.json`);
    fs.writeFileSync(p, JSON.stringify(config), "utf8");
    tempFiles.push(p);
    return p;
}

// ─── --output flag ────────────────────────────────────────────────────────────

describe("CLI run command - --output flag", () => {
    test("exits with code 0 when --output is specified", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
    });

    test("creates the JSON report file at the specified path", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        expect(fs.existsSync(outputPath)).toBe(true);
    });

    test("stdout confirms the report was written with the output path", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Results written to");
        expect(result.stdout).toContain(outputPath);
    });

    test("report contains the top-level required fields", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        expect(report).toHaveProperty("timestamp");
        expect(report).toHaveProperty("hardware");
        expect(report).toHaveProperty("config");
        expect(report).toHaveProperty("results");
    });

    test("report timestamp is a valid ISO 8601 date string", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const ts = new Date(report.timestamp);
        expect(isNaN(ts.getTime())).toBe(false);
    });

    test("report hardware section contains all expected fields", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        expect(report.hardware).toHaveProperty("cpu");
        expect(report.hardware).toHaveProperty("cores");
        expect(report.hardware).toHaveProperty("totalMemoryGB");
        expect(report.hardware).toHaveProperty("platform");
        expect(report.hardware).toHaveProperty("osVersion");
        expect(report.hardware).toHaveProperty("nodeVersion");
    });

    test("report results contain the echo-tool key", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        expect(report.results).toHaveProperty("echo-tool");
    });

    test("cold report has 2 iterations matching config", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        expect(report.results["echo-tool"].cold.iterations).toHaveLength(2);
    });

    test("each cold iteration has buildTime, memoryUsage, size, and fileCount", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        for (const iter of report.results["echo-tool"].cold.iterations) {
            expect(iter).toHaveProperty("buildTime");
            expect(iter).toHaveProperty("memoryUsage");
            expect(iter).toHaveProperty("size");
            expect(iter).toHaveProperty("fileCount");
        }
    });

    test("cold stats contain avg, min, max for time and memory", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const stats = report.results["echo-tool"].cold.stats;
        expect(stats.time).toHaveProperty("avg");
        expect(stats.time).toHaveProperty("min");
        expect(stats.time).toHaveProperty("max");
        expect(stats.memory).toHaveProperty("avg");
        expect(stats.memory).toHaveProperty("min");
        expect(stats.memory).toHaveProperty("max");
    });

    test("warm stats contain avg, min, max for time and memory", () => {
        const outputPath = tempOutput("-warm-stats");
        const configPath = path.join(FIXTURES_DIR, "benchmark.warm.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const stats = report.results["echo-tool"].warm.stats;
        expect(stats.time).toHaveProperty("avg");
        expect(stats.time).toHaveProperty("min");
        expect(stats.time).toHaveProperty("max");
        expect(stats.memory).toHaveProperty("avg");
        expect(stats.memory).toHaveProperty("min");
        expect(stats.memory).toHaveProperty("max");
    });

    test("report config section mirrors the loaded config", () => {
        const outputPath = tempOutput();
        const configPath = path.join(FIXTURES_DIR, "benchmark.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        expect(report.config.iterations).toBe(2);
        expect(report.config.cacheMode).toBe("cold");
        expect(report.config.tools).toHaveLength(1);
        expect(report.config.tools[0].name).toBe("echo-tool");
    });

    test("warm cacheMode report has warm key and no cold key", () => {
        const outputPath = tempOutput("-warm");
        const configPath = path.join(FIXTURES_DIR, "benchmark.warm.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const tool = report.results["echo-tool"];
        expect(tool.warm).toBeDefined();
        expect(tool.cold).toBeUndefined();
    });

    test("both cacheMode report has warm and cold keys", () => {
        const outputPath = tempOutput("-both");
        const configPath = path.join(FIXTURES_DIR, "benchmark.both.config.json");
        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);
        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const tool = report.results["echo-tool"];
        expect(tool.warm).toBeDefined();
        expect(tool.cold).toBeDefined();
    });

    test("outputDir config produces numeric size and fileCount in report", () => {
        const outputPath = tempOutput("-dir");
        // Use a relative outputDir so path.join(cwd, outputDir) resolves correctly
        // inside the Benchmarker (cwd defaults to process.cwd() = project root).
        const relOutputDir = `dist/__integration_test_${crypto.randomUUID()}`;
        const absOutputDir = path.resolve(INDEX_TS, "..", relOutputDir);

        fs.mkdirSync(absOutputDir, { recursive: true });
        fs.writeFileSync(path.join(absOutputDir, "output.js"), "// built", "utf8");

        const configPath = writeTempConfig({
            iterations: 1,
            cacheMode: "cold",
            warmup: false,
            tools: [{ name: "echo-tool", command: "echo built", outputDir: relOutputDir }],
        });

        const result = runCLI(["run", "--file", configPath, "--output", outputPath]);

        fs.rmSync(absOutputDir, { recursive: true, force: true });

        expect(result.status).toBe(0);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const iter = report.results["echo-tool"].cold.iterations[0];
        expect(typeof iter.size).toBe("number");
        expect(typeof iter.fileCount).toBe("number");
        expect(iter.fileCount).toBe(1);
    });
});
