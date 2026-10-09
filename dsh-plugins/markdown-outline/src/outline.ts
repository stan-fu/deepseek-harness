/**
 * Pure outline extraction, separated from the tool registration so it is
 * unit-testable without mounting a Cordis context.
 * @module dsh-markdown-outline/outline
 */

/** One heading entry in a Markdown outline. */
export interface HeadingEntry {
  /** Heading level, 1-6. */
  level: number
  /** Heading text without the leading hashes. */
  text: string
  /** 1-based line number of the heading line. */
  line: number
}

/** Outline result: extracted headings plus the file's total line count. */
export interface Outline {
  headings: HeadingEntry[]
  totalLines: number
}

/**
 * Validate and resolve a max-depth choice.
 * @param raw - the requested maximum heading level.
 * @returns the same number, narrowed to a valid integer 1-6.
 * @throws when the value is not an integer between 1 and 6.
 */
export function resolveMaxDepth(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1 || raw > 6) {
    throw new Error(`maxDepth must be an integer between 1 and 6, got ${JSON.stringify(raw)}`)
  }
  return raw
}

/**
 * Extract the heading outline of Markdown content. ATX headings only.
 * Known limitation: headings inside fenced code blocks are matched too;
 * this version does not track fence state.
 * @param content - the full file content.
 * @param maxDepth - highest heading level to include (1-6), already validated.
 * @returns the headings up to maxDepth and the total line count.
 */
export function extractOutline(content: string, maxDepth: number): Outline {
  const lines = content.split('\n')
  const headings: HeadingEntry[] = []
  for (const [index, line] of lines.entries()) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (match === null) continue
    const hashes = match[1] ?? ''
    const text = match[2] ?? ''
    if (hashes.length > maxDepth) continue
    headings.push({ level: hashes.length, text, line: index + 1 })
  }
  return { headings, totalLines: lines.length }
}
