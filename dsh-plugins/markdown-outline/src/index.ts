/**
 * dsh-markdown-outline: a read-only `markdown_outline` tool for DeepSeek
 * Harness. Returns the heading outline (level, text, line) of a Markdown
 * file so the model can decide which sections of a long document to read
 * in full. Bundles via `dsh.bundle`; install with
 * `dsh plugin --profile <name> add dsh-markdown-outline`.
 * @module dsh-markdown-outline
 */
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { extractOutline, resolveMaxDepth } from './outline.js'

export const name = 'dsh-markdown-outline'
export const inject = ['tools']

/** Bundle configuration, changeable from cordis.patch.yml. */
export interface Config {
  /**
   * Highest heading level the tool may return (1-6). A per-call `maxDepth`
   * argument may only narrow this ceiling, never widen it.
   */
  maxHeadingDepth: number
}

/** Schemastery configuration for the bundle consumer. */
export const Config: z<Config> = z.object({
  maxHeadingDepth: z.number().default(6),
})

export function apply(ctx: Context, config: Config) {
  const ceiling = resolveMaxDepth(config.maxHeadingDepth)
  ctx.tools.register(defineTool({
    name: 'markdown_outline',
    description:
      'Return the heading outline of a Markdown file with heading levels and line numbers. '
      + 'Read this first to decide which sections of a long document to read in full.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path to a Markdown file' },
      maxDepth: { type: 'number', description: `Only include headings up to this level (1-${ceiling}); defaults to ${ceiling}` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          headings: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                level: { type: 'integer', required: true, description: 'Heading level 1-6' },
                text: { type: 'string', required: true, description: 'Heading text' },
                line: { type: 'integer', required: true, description: '1-based line number of the heading' },
              },
            },
          },
          totalLines: { type: 'integer', required: true, description: 'Total lines in the file' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.headings.length === 0
          ? 'No headings found.'
          : value.headings
            .map(h => `${'  '.repeat(h.level - 1)}${'#'.repeat(h.level)} ${h.text} (L${h.line})`)
            .join('\n'),
      }],
    },
    async execute(args, exec) {
      const maxDepth = Math.min(resolveMaxDepth(args.maxDepth ?? ceiling), ceiling)
      const content = await readFile(args.path, { encoding: 'utf8', signal: exec.signal })
      return extractOutline(content, maxDepth)
    },
  }))
}
