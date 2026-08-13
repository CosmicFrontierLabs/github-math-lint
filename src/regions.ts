import type { MathRegion } from "./types.js";

interface Range {
  start: number;
  end: number;
}

function isEscaped(text: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && text[index] === "\\"; index -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function inside(ranges: Range[], offset: number): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function fencedRegions(text: string): { math: MathRegion[]; excluded: Range[] } {
  const math: MathRegion[] = [];
  const excluded: Range[] = [];
  const opener = /^(?<indent>[ \t]*)(?<marker>`{3,}|~{3,})[ \t]*(?<info>[^\r\n]*)\r?$/gm;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(text)) !== null) {
    const marker = match.groups?.marker;
    if (!marker) continue;
    const contentStart = match.index + match[0].length + (text[match.index + match[0].length] === "\n" ? 1 : 0);
    const markerCharacter = marker[0];
    const closing = new RegExp(`^[ \\t]*${markerCharacter === "`" ? "`" : "~"}{${marker.length},}[ \\t]*\\r?$`, "gm");
    closing.lastIndex = contentStart;
    const close = closing.exec(text);
    const end = close ? close.index + close[0].length : text.length;
    const contentEnd = close ? close.index : text.length;
    excluded.push({ start: match.index, end });
    if ((match.groups?.info ?? "").trim().toLowerCase() === "math") {
      math.push({ kind: "fence", source: text.slice(contentStart, contentEnd), sourceOffset: contentStart });
    }
    opener.lastIndex = end;
  }
  return { math, excluded };
}

function inlineCodeRanges(text: string, excluded: Range[]): Range[] {
  const ranges: Range[] = [];
  const lines = text.split(/(?<=\n)/);
  let lineOffset = 0;
  for (const line of lines) {
    let index = 0;
    while (index < line.length) {
      const absolute = lineOffset + index;
      if (line[index] !== "`" || inside(excluded, absolute)) {
        index += 1;
        continue;
      }
      let width = 1;
      while (line[index + width] === "`") width += 1;
      const delimiter = "`".repeat(width);
      const close = line.indexOf(delimiter, index + width);
      if (close < 0) break;
      ranges.push({ start: absolute, end: lineOffset + close + width });
      index = close + width;
    }
    lineOffset += line.length;
  }
  return ranges;
}

/** Extract GitHub-supported math regions while ignoring ordinary code. */
export function extractMathRegions(text: string): MathRegion[] {
  const fences = fencedRegions(text);
  const excluded = [...fences.excluded];
  excluded.push(...inlineCodeRanges(text, excluded));
  const regions = [...fences.math];

  for (let index = 0; index < text.length - 1; index += 1) {
    if (text.slice(index, index + 2) !== "$$" || isEscaped(text, index) || inside(excluded, index)) continue;
    let close = index + 2;
    while (close < text.length - 1) {
      if (text.slice(close, close + 2) === "$$" && !isEscaped(text, close) && !inside(excluded, close)) break;
      close += 1;
    }
    if (close >= text.length - 1) continue;
    regions.push({ kind: "block", source: text.slice(index + 2, close), sourceOffset: index + 2 });
    excluded.push({ start: index, end: close + 2 });
    index = close + 1;
  }

  const lines = text.split(/(?<=\n)/);
  let lineOffset = 0;
  for (const line of lines) {
    for (let index = 0; index < line.length; index += 1) {
      const absolute = lineOffset + index;
      if (line[index] !== "$" || line[index + 1] === "$" || isEscaped(line, index) || inside(excluded, absolute)) continue;
      if (/\s/.test(line[index + 1] ?? "")) continue;
      let close = index + 1;
      while (close < line.length) {
        if (line[close] === "$" && line[close + 1] !== "$" && !isEscaped(line, close)) break;
        close += 1;
      }
      if (close >= line.length || /\s/.test(line[close - 1] ?? "")) continue;
      regions.push({ kind: "inline", source: line.slice(index + 1, close), sourceOffset: absolute + 1 });
      index = close;
    }
    lineOffset += line.length;
  }

  return regions.sort((left, right) => left.sourceOffset - right.sourceOffset);
}
