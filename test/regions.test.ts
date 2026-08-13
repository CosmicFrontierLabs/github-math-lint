import { describe, expect, it } from "vitest";
import { extractMathRegions } from "../src/regions.js";

describe("extractMathRegions", () => {
  it("extracts fenced, block, and inline math", () => {
    const text = "Before $x+y$.\n\n$$\na=b\n$$\n\n```math\nc=d\n```\n";
    expect(extractMathRegions(text).map(({ kind, source }) => [kind, source.trim()])).toEqual([
      ["inline", "x+y"],
      ["block", "a=b"],
      ["fence", "c=d"],
    ]);
  });

  it("ignores ordinary fenced and inline code", () => {
    const text = "`$not_math$`\n```rust\nlet price = \"$5$\";\n```\n";
    expect(extractMathRegions(text)).toEqual([]);
  });

  it("does not interpret currency or escaped dollars as inline math", () => {
    expect(extractMathRegions("Costs $ 5 and \\$x$ stays literal.")).toEqual([]);
  });
});
