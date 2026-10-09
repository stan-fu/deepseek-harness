/**
 * dsh-tool-audit: observes every settled tool call on `tools/result` (an
 * `emit`-mode observer; it can never alter outcomes) and appends one JSON
 * line per call to `<logDir>/tool-audit.jsonl` (default ~/.dsh/logs).
 * @module dsh-tool-audit
 */
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: pulls the `tools/*` event declarations (declaration merging) into
// this module's type graph so ctx.on('tools/result', ...) type-checks.
import type {} from '@deepseek-ai/dsh-tools'
import { shapeRecord } from './record.js'

export const name = 'dsh-tool-audit'
export const inject = ['tools']

/** Bundle configuration, changeable from cordis.patch.yml. */
export interface Config {
  /**
   * Absolute directory that receives tool-audit.jsonl. Defaults to
   * ~/.dsh/logs, matching the DSH home convention for machine-local logs.
   */
  logDir: string
}

/** Schemastery configuration for the bundle consumer. */
export const Config: z<Config> = z.object({
  logDir: z.string().default(join(homedir(), '.dsh', 'logs')),
})

export function apply(ctx: Context, config: Config) {
  mkdirSync(config.logDir, { recursive: true })
  const stream = createWriteStream(join(config.logDir, 'tool-audit.jsonl'), { flags: 'a' })

  ctx.on('tools/result', (exec, result) => {
    const record = shapeRecord(
      exec.name,
      exec.arguments,
      result.isError,
      exec.agent?.id,
      new Date(),
    )
    stream.write(JSON.stringify(record) + '\n')
  })

  // The write stream is plugin-owned state: dispose drains and closes it.
  ctx.effect(() => () => {
    stream.end()
  })
}
