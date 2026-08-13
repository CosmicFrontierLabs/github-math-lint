export type MathKind = "fence" | "block" | "inline";

export interface MathRegion {
  kind: MathKind;
  source: string;
  sourceOffset: number;
}

export interface Finding {
  rule: string;
  message: string;
  file: string;
  line: number;
  column: number;
  excerpt: string;
}

export interface ScanTarget {
  label: string;
  text: string;
  annotationFile?: string;
}
