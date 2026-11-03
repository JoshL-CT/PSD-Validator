import type { AnalysisResult, FixRequestItem, LogEntry } from "../types";

export interface EditEngine {
  name: string;
  apply(
    buffer: Buffer,
    analysis: AnalysisResult,
    requests: FixRequestItem[],
  ): Promise<{ buffer: Buffer; log: LogEntry[] }>;
}
