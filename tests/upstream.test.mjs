import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildUpstream } from '../server/upstream.mjs'

const cfg = { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', apiKey: 'k', hasKey: true }
const chat = { model: 'x', messages: [{ role: 'user', content: 'hi' }], tool_choice: { type: 'tool', name: 'AgentOutput' }, thinking: { type: 'disabled' } }

test('anthropic provider targets the native Messages API with native auth headers', () => {
	const up = buildUpstream(cfg, chat)
	const sent = JSON.parse(up.body)
	assert.equal(up.url, 'https://api.anthropic.com/v1/messages')
	assert.equal(up.headers['x-api-key'], 'k')
	assert.equal(up.headers['anthropic-version'], '2023-06-01')
	assert.equal('Authorization' in up.headers, false)
	assert.equal(sent.model, 'claude-sonnet-5-5')
	assert.equal('tool_choice' in sent, false)
	assert.deepEqual(sent.thinking, { type: 'between_tools' })
	assert.equal(sent.max_tokens, 4096)
})

test('generic provider leaves the body untouched', () => {
	const body = { tool_choice: { type: 'function', function: { name: 'AgentOutput' } }, thinking: { type: 'disabled' } }
	const up = buildUpstream({ ...cfg, provider: 'generic' }, body)
	const sent = JSON.parse(up.body)
	assert.equal(up.url, 'https://api.anthropic.com/v1/chat/completions')
	assert.equal(up.headers.Authorization, 'Bearer k')
	assert.deepEqual(sent.tool_choice, body.tool_choice)
	assert.deepEqual(sent.thinking, { type: 'disabled' })
})

test('openai provider keeps chat/completions with Bearer auth and a pinned model', () => {
	const up = buildUpstream({ ...cfg, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'm1' }, { model: 'other', messages: [] })
	assert.equal(up.url, 'https://api.openai.com/v1/chat/completions')
	assert.equal(up.headers.Authorization, 'Bearer k')
	assert.equal(JSON.parse(up.body).model, 'm1')
})

test('azure provider keeps the deployment URL and api-key header', () => {
	const up = buildUpstream(
		{ ...cfg, provider: 'azure', baseUrl: 'https://r.openai.azure.com', azureDeployment: 'dep 1', azureApiVersion: '2024-10-21' },
		{ messages: [] }
	)
	assert.equal(up.url, 'https://r.openai.azure.com/openai/deployments/dep%201/chat/completions?api-version=2024-10-21')
	assert.equal(up.headers['api-key'], 'k')
	assert.equal('Authorization' in up.headers, false)
})

test('LLM_STRIP_TOOL_CHOICE still applies to non-anthropic providers', () => {
	const up = buildUpstream({ ...cfg, provider: 'generic', stripToolChoice: true }, { tool_choice: 'required', messages: [] })
	assert.equal('tool_choice' in JSON.parse(up.body), false)
})
