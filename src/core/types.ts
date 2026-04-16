export type Severity = "low" | "medium" | "high" | "critical";

export interface A11yIssue {
  id: string;
  message: string;
  severity: Severity;

  file: string;
  line?: number;
  column?: number;

  source: "axe" | "eslint" | "typescript" | "rgaa";

  rule?: string;
}