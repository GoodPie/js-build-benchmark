import { describe, test, expect } from "bun:test";
import { webBuildTools } from "../tools";

describe("webBuildTools", () => {
    test("contains at least the 8 known tools", () => {
        expect(webBuildTools.length).toBeGreaterThanOrEqual(8);
    });

    test("contains webpack, vite, esbuild, rollup, rspack, bun build, rolldown, and farm", () => {
        const names = webBuildTools.map((t) => t.name);
        expect(names).toContain("webpack");
        expect(names).toContain("vite");
        expect(names).toContain("esbuild");
        expect(names).toContain("rollup");
        expect(names).toContain("rspack");
        expect(names).toContain("bun build");
        expect(names).toContain("rolldown");
        expect(names).toContain("farm");
    });

    test("each tool has a name property", () => {
        for (const tool of webBuildTools) {
            expect(typeof tool.name).toBe("string");
            expect(tool.name.length).toBeGreaterThan(0);
        }
    });

    test("each tool has a defaultCommand property", () => {
        for (const tool of webBuildTools) {
            expect(typeof tool.defaultCommand).toBe("string");
            expect(tool.defaultCommand.length).toBeGreaterThan(0);
        }
    });

    test("webpack has the correct defaultCommand", () => {
        const webpack = webBuildTools.find((t) => t.name === "webpack");
        expect(webpack?.defaultCommand).toBe("webpack --mode production");
    });

    test("webpack has the correct clearCacheDir", () => {
        const webpack = webBuildTools.find((t) => t.name === "webpack");
        expect(webpack?.clearCacheDir).toBe("node_modules/.cache/webpack");
    });

    test("esbuild has no clearCacheDir (no default disk cache)", () => {
        const esbuild = webBuildTools.find((t) => t.name === "esbuild");
        expect(esbuild?.clearCacheDir == null).toBe(true);
    });

    test("rollup has no clearCacheDir (in-memory cache only)", () => {
        const rollup = webBuildTools.find((t) => t.name === "rollup");
        expect(rollup?.clearCacheDir == null).toBe(true);
    });

    test("vite has the correct defaultCommand", () => {
        const vite = webBuildTools.find((t) => t.name === "vite");
        expect(vite?.defaultCommand).toBe("vite build");
    });

    test("esbuild has the correct defaultCommand", () => {
        const esbuild = webBuildTools.find((t) => t.name === "esbuild");
        expect(esbuild?.defaultCommand).toBe("esbuild --bundle --minify");
    });

    test("rollup has the correct defaultCommand", () => {
        const rollup = webBuildTools.find((t) => t.name === "rollup");
        expect(rollup?.defaultCommand).toBe("rollup -c");
    });

    test("rspack has the correct defaultCommand", () => {
        const rspack = webBuildTools.find((t) => t.name === "rspack");
        expect(rspack?.defaultCommand).toBe("rspack build");
    });

    test("bun build has no clearCacheDir (property is absent or explicitly undefined)", () => {
        const bunBuild = webBuildTools.find((t) => t.name === "bun build");
        // clearCacheDir is set to `undefined` explicitly in tools.ts — the field is
        // present in the object but has no meaningful value. Either form is acceptable.
        expect(bunBuild?.clearCacheDir == null).toBe(true);
    });

    test("rolldown has the correct defaultCommand", () => {
        const rolldown = webBuildTools.find((t) => t.name === "rolldown");
        expect(rolldown?.defaultCommand).toBe("rolldown --config");
    });

    test("rolldown has no clearCacheDir", () => {
        const rolldown = webBuildTools.find((t) => t.name === "rolldown");
        expect(rolldown?.clearCacheDir == null).toBe(true);
    });

    test("farm has the correct defaultCommand", () => {
        const farm = webBuildTools.find((t) => t.name === "farm");
        expect(farm?.defaultCommand).toBe("farm build");
    });

    test("farm has the correct clearCacheDir", () => {
        const farm = webBuildTools.find((t) => t.name === "farm");
        expect(farm?.clearCacheDir).toBe("node_modules/.farm");
    });
});
