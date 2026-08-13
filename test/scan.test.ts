import { describe, expect, it } from "vitest";
import { hasSkippedExtension, scanTarget } from "../src/scan.js";

describe("scanTarget", () => {
  it("reports every issue across every math region", () => {
    const text = [
      "Inline $a\\,b~c$.",
      "",
      "$$",
      "\\operatorname{x} [AD-1]",
      "+ \\mathrm{tail}",
      "$$",
      "",
      "| value | $P(A|B)$ |",
    ].join("\n");
    const findings = scanTarget({ label: "example.md", text });
    expect(findings.map((finding) => finding.rule)).toEqual([
      "markdown-escape",
      "tilde-in-math",
      "unsupported-macro",
      "markdown-link-in-math",
      "operator-initial-block-line",
      "inline-math-table-pipe",
    ]);
  });

  it("reports repeated findings rather than stopping after the first", () => {
    const findings = scanTarget({ label: "many.md", text: "$a\\,b$ and $c\\,d$" });
    expect(findings).toHaveLength(2);
    expect(findings.map(({ line, column }) => [line, column])).toEqual([[1, 3], [1, 14]]);
  });

  it("does not flag valid matrix brackets as reference links", () => {
    expect(scanTarget({ label: "matrix.md", text: "$A=[x,y]$" })).toEqual([]);
  });

  it.each([",", "!", ";", "_", "#", "|", "(", ")", "[", "]"])(
    "reports the Markdown-sensitive \\%s escape",
    (punctuation) => {
      const findings = scanTarget({ label: "escape.md", text: `$a\\${punctuation}b$` });
      expect(findings.map(({ rule }) => rule)).toEqual(["markdown-escape"]);
    },
  );

  it.each([
    "$$[label](https://example.com)$$",
    "$$[label][reference]$$",
    "$$[AD-1]$$",
  ])("reports Markdown link form %s", (text) => {
    expect(scanTarget({ label: "link.md", text }).map(({ rule }) => rule)).toEqual([
      "markdown-link-in-math",
    ]);
  });

  it("does not apply the operator-line rule to math fences", () => {
    expect(scanTarget({ label: "fence.md", text: "```math\n+ \\mathrm{x}\n```" })).toEqual([]);
  });
});

describe("hasSkippedExtension", () => {
  const extensions = new Set([".tex", ".sty", ".cls"]);

  it("skips real LaTeX even when a broad path glob includes it", () => {
    expect(hasSkippedExtension("paper/main.tex", extensions)).toBe(true);
    expect(hasSkippedExtension("paper/commands.STY", extensions)).toBe(true);
    expect(hasSkippedExtension("docs/math.md", extensions)).toBe(false);
  });
});
