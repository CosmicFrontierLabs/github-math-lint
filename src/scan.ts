import { extractMathRegions } from "./regions.js";
import type { Finding, MathRegion, ScanTarget } from "./types.js";

const DISALLOWED_MACROS = new Map([
  ["\\operatorname", "use \\mathrm instead"],
  ["\\phantom", "use an explicit spacing command such as \\quad instead"],
  ["\\hphantom", "use an explicit spacing command such as \\quad instead"],
  ["\\vphantom", "use an explicit spacing command such as \\quad instead"],
]);

const MARKDOWN_ESCAPES = new Map([
  [",", "use a plain space or \\ "],
  ["!", "remove the negative spacing command"],
  [";", "use a plain space or \\quad"],
  ["_", "avoid underscores inside math text; move code outside math or use plain words"],
  ["#", "move the hash outside math or spell it as text"],
  ["|", "use \\vert or \\mid as appropriate"],
  ["(", "remove the nested math delimiter"],
  [")", "remove the nested math delimiter"],
  ["[", "remove the nested math delimiter"],
  ["]", "remove the nested math delimiter"],
]);

function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lastNewline = before.lastIndexOf("\n");
  return { line: before.split("\n").length, column: offset - lastNewline };
}

function excerptAt(text: string, offset: number): string {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  const next = text.indexOf("\n", offset);
  return text.slice(start, next < 0 ? text.length : next).trim().slice(0, 240);
}

function finding(target: ScanTarget, rule: string, message: string, offset: number): Finding {
  const location = lineAndColumn(target.text, offset);
  return { rule, message, file: target.label, ...location, excerpt: excerptAt(target.text, offset) };
}

function occurrences(source: string, expression: RegExp): number[] {
  return [...source.matchAll(expression)].map((match) => match.index ?? 0);
}

function scanRegion(target: ScanTarget, region: MathRegion): Finding[] {
  const findings: Finding[] = [];
  for (const [macro, replacement] of DISALLOWED_MACROS) {
    const expression = new RegExp(`${macro.replace(/\\/g, "\\\\")}\\b`, "g");
    for (const offset of occurrences(region.source, expression)) {
      findings.push(finding(target, "unsupported-macro", `${macro} is rejected by GitHub's math renderer; ${replacement}`, region.sourceOffset + offset));
    }
  }

  for (const match of region.source.matchAll(/\\([,!;_#|()[\]])/g)) {
    const punctuation = match[1] ?? "";
    findings.push(finding(target, "markdown-escape", `\\${punctuation} is consumed or rewritten by GitHub Markdown before math rendering; ${MARKDOWN_ESCAPES.get(punctuation)}`, region.sourceOffset + (match.index ?? 0)));
  }

  for (const offset of occurrences(region.source, /~/g)) {
    findings.push(finding(target, "tilde-in-math", "~ can pair into GFM strikethrough before math rendering; do not use tildes inside GitHub math", region.sourceOffset + offset));
  }

  const linkPatterns = [
    /\[[^\]\n]+\]\([^\n)]*\)/g,
    /\[[^\]\n]+\]\[[^\]\n]*\]/g,
    /\[[A-Z][A-Z0-9-]+\]/g,
  ];
  for (const pattern of linkPatterns) {
    for (const offset of occurrences(region.source, pattern)) {
      findings.push(finding(target, "markdown-link-in-math", "Markdown link or reference syntax is expanded before math rendering; move the citation or link outside the math region", region.sourceOffset + offset));
    }
  }

  if (region.kind === "block") {
    const operatorLine = /^(?<indent>[ \t]*)(?<operator>[+*-])(?=\s|\\)/gm;
    for (const match of region.source.matchAll(operatorLine)) {
      const operatorOffset = (match.index ?? 0) + (match.groups?.indent?.length ?? 0);
      findings.push(finding(target, "operator-initial-block-line", "A math-block line beginning with +, -, or * can become a Markdown list item; join it to the preceding line", region.sourceOffset + operatorOffset));
    }
  }

  if (region.kind === "inline") {
    const lineStart = target.text.lastIndexOf("\n", region.sourceOffset - 1) + 1;
    const lineEndIndex = target.text.indexOf("\n", region.sourceOffset);
    const lineEnd = lineEndIndex < 0 ? target.text.length : lineEndIndex;
    const outsideMath = [
      target.text.slice(lineStart, region.sourceOffset - 1),
      target.text.slice(region.sourceOffset + region.source.length + 1, lineEnd),
    ].join("");
    const isTableRow = /(?<!\\)\|/.test(outsideMath);
    if (isTableRow) {
      for (const offset of occurrences(region.source, /(?<!\\)\|/g)) {
        findings.push(finding(target, "inline-math-table-pipe", "A raw | inside inline math splits a Markdown table cell; use \\vert or \\mid", region.sourceOffset + offset));
      }
    }
  }
  return findings;
}

/** Scan one Markdown source and return every finding, not just the first. */
export function scanTarget(target: ScanTarget): Finding[] {
  const unique = new Map<string, Finding>();
  for (const region of extractMathRegions(target.text)) {
    for (const result of scanRegion(target, region)) {
      unique.set(`${result.rule}:${result.line}:${result.column}`, result);
    }
  }
  return [...unique.values()].sort((left, right) => left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule));
}

/** Whether a path has an explicitly skipped extension. */
export function hasSkippedExtension(path: string, extensions: Set<string>): boolean {
  const lower = path.toLowerCase();
  return [...extensions].some((extension) => lower.endsWith(extension));
}
