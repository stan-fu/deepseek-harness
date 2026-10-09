/**
 * Pure audit-record shaping, separated from the Cordis listener so it is
 * unit-testable without a mounted context.
 * @module dsh-tool-audit/record
 */

/** One settled tool call, shaped for the JSONL audit log. */
export interface AuditRecord {
  /** ISO-8601 timestamp of the settlement observation. */
  time: string
  /** Tool name the model called. */
  tool: string
  /** Owning agent id, when the call carries one. */
  agent?: string
  /** Whether the settled outcome is an error. */
  isError: boolean
  /** Byte size of the model arguments' JSON serialization. */
  argsBytes: number
}

/**
 * Shape one audit record from a settled tool execution.
 * @param tool - tool name.
 * @param args - the execution's model arguments (already validated/frozen upstream).
 * @param isError - whether the outcome is an error.
 * @param agent - owning agent id, if any.
 * @param time - observation timestamp.
 * @returns the audit record.
 */
export function shapeRecord(
  tool: string,
  args: unknown,
  isError: boolean,
  agent: string | undefined,
  time: Date,
): AuditRecord {
  return {
    time: time.toISOString(),
    tool,
    ...(agent === undefined ? {} : { agent }),
    isError,
    argsBytes: JSON.stringify(args ?? null).length,
  }
}
