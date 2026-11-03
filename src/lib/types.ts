export type Severity = "error" | "warning" | "info";

export type RuleId =
  | "file-size"
  | "hidden-layer"
  | "ambiguous-name"
  | "generic-name"
  | "empty-text"
  | "guide-layer"
  | "point-text"
  | "static-smart-object"
  | "group-depth"
  | "group-name-case";

export type FixKind = "none" | "delete" | "rename" | "convert-paragraph" | "rasterize";

export interface Issue {
  id: string;
  rule: RuleId;
  severity: Severity;
  title: string;
  detail: string;
  /** Section of the best practices guide this comes from */
  guideRef: string;
  layerPath: string;
  layerId?: number;
  layerName: string;
  fix: {
    kind: FixKind;
    /** What the fix will do, in plain words */
    description: string;
    suggestedName?: string;
    /** Rename fixes need a name before they can run */
    needsInput?: boolean;
  };
}

export interface AnalysisResult {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  layerCount: number;
  issues: Issue[];
}

export interface FixRequestItem {
  issueId: string;
  /** User supplied name for rename fixes */
  newName?: string;
}

export interface LogEntry {
  issueId: string;
  rule: RuleId;
  layerName: string;
  action: string;
  status: "applied" | "skipped" | "failed";
  detail?: string;
}

export interface FixResult {
  engine: string;
  log: LogEntry[];
  after: AnalysisResult;
}

export interface JobRecord {
  id: string;
  fileName: string;
  analysis: AnalysisResult;
  fixed?: FixResult;
}
