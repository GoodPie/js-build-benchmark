import { describe, test, expect } from "bun:test";
import { webBuildTools } from "../tools";

describe("webBuildTools", () => {
    test("contains at least the 6 known tools", () => {
        expect(webBuildTools.length).toBeGreaterThanOrEqual(6);
    });

    test("contains webpack, vite, esbuild, rollup, rspack, and bun build", () => {
        const names = webBuildTools.map((t) => t.name);
        expect(names).toContain("webpack");
        expect(names).toContain("vite");
        expect(names).toContain("esbuild");
        expect(names).toContain("rollup");
        expect(names).toContain("rspack");
        expect(names).toContain("bun build");
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
});
