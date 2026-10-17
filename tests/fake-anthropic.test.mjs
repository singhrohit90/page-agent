import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { startFakeAnthropic } from './fake-anthropic.mjs'

// Guards the fake itself: if it stops rejecting what the real API rejects, the proxy tests prove nothing.
const fake = await startFakeAnthropic({ apiKey: 'k1' })
after(() => fake.close())

const ok = { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }
const call = async (body, headers = { 'x-api-key': 'k1', 'anthropic-version': '2023-06-01' }) => {
	const res = await fetch(`${fake.baseUrl}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
	return { status: res.status, json: await res.json() }
}

test('accepts a valid request and answers in native shape', async () => {
	const r = await call({ ...ok, tools: [{ name: 'AgentOutput', input_schema: { type: 'object' } }] })
	assert.equal(r.status, 200)
	assert.equal(r.json.type, 'message')
	assert.equal(r.json.content.find((b) => b.type === 'tool_use').name, 'AgentOutput')
})

test('rejects what the real API rejects', async () => {
	assert.equal((await call(ok, {})).status, 401)
	assert.match((await call(ok, { 'x-api-key': 'k1' })).json.error.message, /anthropic-version/)
	const { max_tokens: _omit, ...noMax } = ok
	assert.match((await call(noMax)).json.error.message, /max_tokens/)
	for (const type of ['tool', 'any']) {
		const r = await call({ ...ok, tool_choice: { type, name: 'x' } })
		assert.equal(r.status, 400)
		assert.equal(r.json.error.message, 'tool_choice: type "tool" and "any" are not supported for this model.')
	}
	const t = await call({ ...ok, thinking: { type: 'disabled' } })
	assert.equal(t.json.error.message, 'To turn thinking off on this model, send "thinking": {"type": "between_tools"} instead of {"type": "disabled"}.')
	assert.match((await call({ ...ok, parallel_tool_calls: false })).json.error.message, /Extra inputs/)
	assert.match((await call({ ...ok, tools: [{ type: 'function', function: { name: 'x' } }] })).json.error.message, /tools\.0/)
	assert.match((await call({ ...ok, messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'nope', content: 'x' }] }] })).json.error.message, /tool_result/)
})
