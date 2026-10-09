import test from 'node:test'
import assert from 'node:assert/strict'
import { extractOutline, resolveMaxDepth } from '../src/outline.js'

test('extracts ATX headings with level, text, and line number', () => {
  const outline = extractOutline('# Title\n\npara\n## Section A\n\n### Sub\n', 6)
  assert.deepEqual(outline, {
    headings: [
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Section A', line: 4 },
      { level: 3, text: 'Sub', line: 6 },
    ],
    totalLines: 7,
  })
})

test('maxDepth filters deeper headings but keeps totalLines', () => {
  const outline = extractOutline('# Title\n## A\n### B\n', 2)
  assert.deepEqual(outline.headings.map(h => h.text), ['Title', 'A'])
  assert.equal(outline.totalLines, 4)
})

test('requires whitespace after the hashes', () => {
  const outline = extractOutline('#NoSpace\n# Real\n', 6)
  assert.deepEqual(outline.headings.map(h => h.text), ['Real'])
})

test('empty content yields no headings', () => {
  assert.deepEqual(extractOutline('', 6), { headings: [], totalLines: 1 })
})

test('known limitation: headings inside fenced code blocks are matched too', () => {
  const outline = extractOutline('```\n# comment in fence\n```\n', 6)
  assert.equal(outline.headings.length, 1)
})

test('resolveMaxDepth accepts 1-6 and rejects everything else', () => {
  for (const value of [1, 3, 6]) assert.equal(resolveMaxDepth(value), value)
  for (const bad of [0, 7, 1.5, Number.NaN]) assert.throws(() => resolveMaxDepth(bad))
})
