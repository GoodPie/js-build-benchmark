import { describe, test, expect } from "bun:test";
import { BuildToolError } from "../errors";

describe("BuildToolError", () => {
    test("is an instance of Error", () => {
        const err = new BuildToolError("something failed");
        expect(err).toBeInstanceOf(Error);
    });

    test("is an instance of BuildToolError", () => {
        const err = new BuildToolError("something failed");
        expect(err).toBeInstanceOf(BuildToolError);
    });

    test("has the correct message", () => {
        const err = new BuildToolError("build failed for webpack");
        expect(err.message).toBe("build failed for webpack");
    });

    test("can be caught as an Error", () => {
        expect(() => {
            throw new BuildToolError("test error");
        }).toThrow("test error");
    });

    test("can be caught as a BuildToolError", () => {
        let caught: unknown;
        try {
            throw new BuildToolError("test");
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(BuildToolError);
    });
});
