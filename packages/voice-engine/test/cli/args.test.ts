import { describe, expect, it } from "vitest";
import { choice, flag, numeric, option, parseArgs, repeated, UsageError } from "../../src/cli/args.js";

describe("argument parser", () => {
  it("handles both value forms, repeated flags, booleans and positionals", () => {
    const args = parseArgs(["voices", "--language", "es-ES", "--tag=calm", "--tag", "narration", "--json", "--play=false"]);
    expect(args.positionals).toEqual(["voices"]);
    expect(option(args, "language")).toBe("es-ES");
    expect(repeated(args, "tag")).toEqual(["calm", "narration"]);
    expect(flag(args, "json")).toBe(true);
    expect(flag(args, "play")).toBe(false);
  });
  it("preserves negative numeric values, stdin and -- literals", () => {
    const args = parseArgs(["speak", "-", "--pitch", "-4", "--", "--literal"]);
    expect(args.positionals).toEqual(["speak", "-", "--literal"]);
    expect(numeric(args, "pitch", -12, 12)).toBe(-4);
  });
  it.each([["--voice"], ["--voice", "--json"], ["--json=maybe"]])("rejects malformed options: %s", (...argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
  });
  it("rejects duplicate singleton flags and invalid numeric ranges", () => {
    expect(() => option(parseArgs(["--voice=a", "--voice=b"]), "voice")).toThrow(UsageError);
    expect(() => numeric(parseArgs(["--limit=1.5"]), "limit", 1, 20, true)).toThrow(UsageError);
    expect(() => numeric(parseArgs(["--limit=Infinity"]), "limit")).toThrow(UsageError);
    expect(() => choice(parseArgs(["--tier=typo"]), "tier", ["fast"])).toThrow(UsageError);
  });
  it("uses a prototype-free option map", () => {
    expect(option(parseArgs(["--__proto__=value"]), "__proto__")).toBe("value");
  });
});
