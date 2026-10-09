import test from 'node:test'
import assert from 'node:assert/strict'
import { shapeRecord } from '../src/record.js'

test('shapes a full record with agent id', () => {
  const time = new Date('2026-10-09T00:00:00.000Z')
  const record = shapeRecord('markdown_outline', { path: '/tmp/a.md' }, false, 'agent-1', time)
  assert.deepEqual(record, {
    time: '2026-10-09T00:00:00.000Z',
    tool: 'markdown_outline',
    agent: 'agent-1',
    isError: false,
    argsBytes: JSON.stringify({ path: '/tmp/a.md' }).length,
  })
})

test('omits the agent key when no agent owns the call', () => {
  const record = shapeRecord('bash', null, true, undefined, new Date(0))
  assert.equal('agent' in record, false)
  assert.equal(record.isError, true)
})

test('argsBytes counts the JSON serialization, null included', () => {
  const withArgs = shapeRecord('t', { a: 1 }, false, undefined, new Date(0))
  const nullArgs = shapeRecord('t', null, false, undefined, new Date(0))
  assert.equal(withArgs.argsBytes, JSON.stringify({ a: 1 }).length)
  assert.equal(nullArgs.argsBytes, JSON.stringify(null).length)
})
