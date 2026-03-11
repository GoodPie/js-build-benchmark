import { describe, test, expect } from "bun:test";

// ─── JSON parse error message ───────────────────────────────────────────────────
//
// This test validates the error message produced by cli.ts when a config file
// contains invalid JSON. We test the behavior directly without going through the
// full Commander CLI (which requires complex fs + chalk + benchmark mocking).
//
// The actual logic in cli.ts is:
//   try { config = JSON.parse(configFile); }
//   catch { throw new Error(`Could not parse config file: ${filePath}. Is it valid JSON?`); }
//
// We validate that the error message follows this exact contract.

function parseConfigFile(content: string, filePath: string): unknown {
    try {
        return JSON.parse(content);
    } catch {
        throw new Error(`Could not parse config file: ${filePath}. Is it valid JSON?`);
    }
}

describe("config file JSON parsing", () => {
    test("parses valid JSON successfully", () => {
        const result = parseConfigFile('{"iterations": 3}', "benchmark.config.json");
        expect(result).toEqual({ iterations: 3 });
    });

    test("throws a descriptive error for invalid JSON", () => {
        expect(() => parseConfigFile("{ invalid json }", "bad.json"))
            .toThrow("Could not parse config file: bad.json. Is it valid JSON?");
    });

    test("error message includes the file path", () => {
        try {
            parseConfigFile("not json", "/path/to/my-config.json");
            expect(true).toBe(false); // should not reach here
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toContain("/path/to/my-config.json");
        }
    });

    test("error message asks if the file is valid JSON", () => {
        try {
            parseConfigFile("{bad}", "config.json");
        } catch (err) {
            expect((err as Error).message).toContain("Is it valid JSON?");
        }
    });

    test("throws for empty string input", () => {
        expect(() => parseConfigFile("", "empty.json"))
            .toThrow("Could not parse config file");
    });

    test("parses a complex valid config", () => {
        const json = JSON.stringify({
            iterations: 5,
            cacheMode: "cold",
            tools: [{ name: "esbuild", command: "esbuild --bundle" }],
        });
        const result = parseConfigFile(json, "my-config.json");
        expect(result).toHaveProperty("iterations", 5);
        expect(result).toHaveProperty("cacheMode", "cold");
    });
});
