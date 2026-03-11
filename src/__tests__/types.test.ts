import { describe, test, expect } from "bun:test";
import { BuildToolConfigSchema, BenchmarkConfigSchema } from "../types";
import { ZodError } from "zod";

describe("BuildToolConfigSchema", () => {
    test("accepts a valid minimal config (name + command only)", () => {
        const result = BuildToolConfigSchema.safeParse({
            name: "esbuild",
            command: "esbuild --bundle src/index.ts",
        });
        expect(result.success).toBe(true);
    });

    test("accepts a valid config with all optional fields", () => {
        const result = BuildToolConfigSchema.safeParse({
            name: "webpack",
            command: "webpack --mode production",
            outputDir: "dist/",
            env: { NODE_ENV: "production" },
            clearCacheCommand: "rm -rf node_modules/.cache",
            clearCacheDir: "node_modules/.cache/webpack",
        });
        expect(result.success).toBe(true);
    });

    test("rejects a config with missing name", () => {
        const result = BuildToolConfigSchema.safeParse({
            command: "esbuild --bundle",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeInstanceOf(ZodError);
            const fields = result.error.issues.map((i) => i.path[0]);
            expect(fields).toContain("name");
        }
    });

    test("rejects a config with missing command", () => {
        const result = BuildToolConfigSchema.safeParse({
            name: "esbuild",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path[0]);
            expect(fields).toContain("command");
        }
    });

    test("rejects non-string env values", () => {
        const result = BuildToolConfigSchema.safeParse({
            name: "esbuild",
            command: "esbuild --bundle",
            env: { PORT: 3000 },
        });
        expect(result.success).toBe(false);
    });
});

describe("BenchmarkConfigSchema", () => {
    const validTool = { name: "esbuild", command: "esbuild --bundle" };

    test("applies default iterations of 30", () => {
        const result = BenchmarkConfigSchema.parse({
            tools: [validTool],
        });
        expect(result.iterations).toBe(30);
    });

    test("applies default clearCache of true", () => {
        const result = BenchmarkConfigSchema.parse({
            tools: [validTool],
        });
        expect(result.clearCache).toBe(true);
    });

    test("applies default warmup of false", () => {
        const result = BenchmarkConfigSchema.parse({
            tools: [validTool],
        });
        expect(result.warmup).toBe(false);
    });

    test("accepts a custom iterations value", () => {
        const result = BenchmarkConfigSchema.parse({
            iterations: 5,
            tools: [validTool],
        });
        expect(result.iterations).toBe(5);
    });

    test("rejects iterations of 0", () => {
        expect(() =>
            BenchmarkConfigSchema.parse({ iterations: 0, tools: [validTool] })
        ).toThrow(ZodError);
    });

    test("rejects non-integer iterations", () => {
        expect(() =>
            BenchmarkConfigSchema.parse({ iterations: 3.5, tools: [validTool] })
        ).toThrow(ZodError);
    });

    test("rejects an empty tools array", () => {
        expect(() =>
            BenchmarkConfigSchema.parse({ tools: [] })
        ).toThrow(ZodError);
    });

    test("accepts optional cwd and globalEnv", () => {
        const result = BenchmarkConfigSchema.parse({
            tools: [validTool],
            cwd: "/projects/myapp",
            globalEnv: { CI: "true" },
        });
        expect(result.cwd).toBe("/projects/myapp");
        expect(result.globalEnv?.["CI"]).toBe("true");
    });

    test("rejects negative iterations", () => {
        expect(() =>
            BenchmarkConfigSchema.parse({ iterations: -1, tools: [validTool] })
        ).toThrow(ZodError);
    });

    test("accepts clearCache set to false", () => {
        const result = BenchmarkConfigSchema.parse({
            tools: [validTool],
            clearCache: false,
        });
        expect(result.clearCache).toBe(false);
    });
});
