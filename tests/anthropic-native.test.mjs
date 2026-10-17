import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	TranslationError,
	anthropicErrorMessage,
	fromAnthropicResponse,
	toAnthropicRequest,
	toStrictSchema,
} from '../server/anthropic-native.mjs'

const OPTS = { model: 'claude-sonnet-5-5', thinking: 'between_tools', strict: false }

const AGENT_TOOL = {
	type: 'function',
	function: {
		name: 'AgentOutput',
		description: 'You MUST call this tool every step!',
		parameters: {
			type: 'object',
			properties: {
				memory: { type: 'string' },
				action: {
					anyOf: [
						{
							type: 'object',
							properties: { click_element_by_index: { type: 'object', properties: { index: { type: 'integer', minimum: 0, maximum: 9007199254740991 } }, required: ['index'], additionalProperties: false } },
							required: ['click_element_by_index'],
							additionalProperties: false,
						},
					],
				},
			},
			required: ['action'],
			additionalProperties: false,
		},
	},
}

test('request: system to top-level, tools to input_schema, no tool_choice, thinking rewritten', () => {
	const { body, shape } = toAnthropicRequest(
		{
			model: 'ignored',
			messages: [
				{ role: 'system', content: 'sys A' },
				{ role: 'user', content: 'hello' },
			],
			tools: [AGENT_TOOL],
			tool_choice: { type: 'tool', name: 'AgentOutput' },
			parallel_tool_calls: false,
			thinking: { type: 'disabled' },
			reasoning_effort: 'low',
			temperature: 0.2,
			odd_field: 1,
		},
		OPTS
	)
	assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'system', 'temperature', 'thinking', 'tools'])
	assert.equal(body.model, 'claude-sonnet-5-5')
	assert.equal(body.system, 'sys A')
	assert.deepEqual(body.messages, [{ role: 'user', content: 'hello' }])
	assert.equal(body.max_tokens, 4096)
	assert.equal(body.temperature, 0.2)
	assert.deepEqual(body.thinking, { type: 'between_tools' })
	assert.equal(body.tools[0].name, 'AgentOutput')
	assert.equal(body.tools[0].description, 'You MUST call this tool every step!')
	assert.deepEqual(body.tools[0].input_schema, AGENT_TOOL.function.parameters)
	assert.equal('strict' in body.tools[0], false)
	assert.deepEqual(shape, {
		toolCount: 1,
		toolChoiceSent: false,
		thinkingSent: 'between_tools',
		strict: false,
		maxTokens: 4096,
		messageCount: 1,
		droppedFields: 1,
	})
})

test('request: max_tokens precedence and thinking handling', () => {
	const base = { messages: [{ role: 'user', content: 'x' }] }
	assert.equal(toAnthropicRequest({ ...base, max_tokens: 10, max_completion_tokens: 20 }, OPTS).body.max_tokens, 10)
	assert.equal(toAnthropicRequest({ ...base, max_completion_tokens: 20 }, OPTS).body.max_tokens, 20)
	assert.equal('thinking' in toAnthropicRequest(base, OPTS).body, false)
	assert.equal('thinking' in toAnthropicRequest({ ...base, thinking: { type: 'enabled', budget_tokens: 1024 } }, OPTS).body, false)
	assert.equal('thinking' in toAnthropicRequest({ ...base, thinking: { type: 'disabled' } }, { ...OPTS, thinking: 'omit' }).body, false)
	assert.throws(() => toAnthropicRequest({ ...base, max_tokens: 'many' }, OPTS), TranslationError)
})

test('request: multi-turn with tool_use and tool_result', () => {
	const { body } = toAnthropicRequest(
		{
			messages: [
				{ role: 'system', content: 'sys' },
				{ role: 'user', content: 'open work orders' },
				{
					role: 'assistant',
					content: 'Clicking.',
					tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'AgentOutput', arguments: '{"action":{"click_element_by_index":{"index":3}}}' } }],
				},
				{ role: 'tool', tool_call_id: 'call_1', content: 'Clicked element 3' },
				{ role: 'user', content: [{ type: 'text', text: 'next page state' }] },
				{ role: 'assistant', content: null, tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'AgentOutput', arguments: '{"action":{"done":{"text":"ok","success":true}}}' } }] },
				{ role: 'tool', tool_call_id: 'call_2', content: 'done' },
			],
		},
		OPTS
	)
	assert.equal(body.system, 'sys')
	assert.deepEqual(body.messages, [
		{ role: 'user', content: 'open work orders' },
		{
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Clicking.' },
				{ type: 'tool_use', id: 'call_1', name: 'AgentOutput', input: { action: { click_element_by_index: { index: 3 } } } },
			],
		},
		{
			role: 'user',
			content: [
				{ type: 'tool_result', tool_use_id: 'call_1', content: 'Clicked element 3' },
				{ type: 'text', text: 'next page state' },
			],
		},
		{
			role: 'assistant',
			content: [{ type: 'tool_use', id: 'call_2', name: 'AgentOutput', input: { action: { done: { text: 'ok', success: true } } } }],
		},
		{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_2', content: 'done' }] },
	])
})

test('request: untranslatable input fails loudly', () => {
	const bad = (messages) => () => toAnthropicRequest({ messages }, OPTS)
	assert.throws(bad([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }]), /text only/)
	assert.throws(bad([{ role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'T', arguments: '{oops' } }] }, { role: 'user', content: 'x' }]), /not valid JSON/)
	assert.throws(bad([{ role: 'function', content: 'x' }]), /unsupported role/)
	assert.throws(bad([{ role: 'system', content: 'only system' }]), /at least one/)
	assert.throws(() => toAnthropicRequest({ messages: [{ role: 'user', content: 'x' }], stream: true }, OPTS), /stream/)
})

test('strict: adds strict:true and strips constraints strict mode does not accept', () => {
	const { body, shape } = toAnthropicRequest({ messages: [{ role: 'user', content: 'x' }], tools: [AGENT_TOOL] }, { ...OPTS, strict: true })
	assert.equal(body.tools[0].strict, true)
	assert.equal(shape.strict, true)
	const idx = body.tools[0].input_schema.properties.action.anyOf[0].properties.click_element_by_index.properties.index
	assert.equal(idx.type, 'integer')
	assert.equal('minimum' in idx, false)
	assert.equal('maximum' in idx, false)
	assert.match(idx.description, /minimum 0/)
	assert.equal(body.tools[0].input_schema.additionalProperties, false)
	// The original schema is not mutated.
	assert.equal(AGENT_TOOL.function.parameters.properties.action.anyOf[0].properties.click_element_by_index.properties.index.minimum, 0)
})

test('strict: nullable becomes anyOf with null and objects get additionalProperties false', () => {
	const out = toStrictSchema({ type: 'object', properties: { a: { type: 'string', nullable: true } } })
	assert.equal(out.additionalProperties, false)
	assert.deepEqual(out.properties.a, { anyOf: [{ type: 'string' }, { type: 'null' }] })
})

test('response: tool_use to tool_calls, usage, ids, thinking ignored', () => {
	const input = { action: { done: { text: 'ok', success: true } } }
	const out = fromAnthropicResponse({
		id: 'msg_1',
		type: 'message',
		role: 'assistant',
		model: 'claude-sonnet-5-5',
		content: [
			{ type: 'thinking', thinking: 'hmm', signature: 's' },
			{ type: 'text', text: 'Part one. ' },
			{ type: 'text', text: 'Part two.' },
			{ type: 'tool_use', id: 'toolu_1', name: 'AgentOutput', input },
		],
		stop_reason: 'tool_use',
		usage: { input_tokens: 100, output_tokens: 25 },
	})
	assert.equal(out.object, 'chat.completion')
	assert.equal(out.id, 'msg_1')
	assert.equal(out.model, 'claude-sonnet-5-5')
	assert.equal(out.choices[0].finish_reason, 'tool_calls')
	assert.equal(out.choices[0].message.content, 'Part one. Part two.')
	assert.deepEqual(out.choices[0].message.tool_calls, [{ id: 'toolu_1', type: 'function', function: { name: 'AgentOutput', arguments: JSON.stringify(input) } }])
	assert.deepEqual(out.usage, { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 })
})

test('response: stop reasons and null content', () => {
	const mk = (stop_reason) => fromAnthropicResponse({ id: 'm', type: 'message', model: 'x', content: [], stop_reason, usage: {} })
	assert.equal(mk('end_turn').choices[0].finish_reason, 'stop')
	assert.equal(mk('stop_sequence').choices[0].finish_reason, 'stop')
	assert.equal(mk('max_tokens').choices[0].finish_reason, 'length')
	assert.equal(mk('mystery').choices[0].finish_reason, 'mystery')
	assert.equal(mk('end_turn').choices[0].message.content, null)
	assert.equal('tool_calls' in mk('end_turn').choices[0].message, false)
	assert.throws(() => fromAnthropicResponse({ choices: [] }), TranslationError)
})

test('response: a malformed action union is passed through unchanged, never repaired', () => {
	for (const input of [{ action: { question: 'Which station?' } }, { action: { index: 3 } }, { evaluation_previous_goal: 'x' }]) {
		const out = fromAnthropicResponse({ id: 'm', type: 'message', model: 'x', content: [{ type: 'tool_use', id: 't', name: 'AgentOutput', input }], stop_reason: 'tool_use', usage: {} })
		assert.equal(out.choices[0].message.tool_calls[0].function.arguments, JSON.stringify(input))
	}
})

test('error: native error JSON maps to a short message', () => {
	assert.equal(anthropicErrorMessage({ type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }), 'bad')
	assert.equal(anthropicErrorMessage({ type: 'error', error: { message: 'x'.repeat(500) } }).length, 300)
	assert.equal(anthropicErrorMessage(undefined), 'Upstream error')
})

test('describeAnthropicResponse logs key names only, never values', async () => {
	const { describeAnthropicResponse } = await import('../server/upstream.mjs')
	const shape = describeAnthropicResponse({
		stop_reason: 'tool_use',
		content: [{ type: 'tool_use', name: 'AgentOutput', input: { next_goal: 'SECRET GOAL', action: { index: 5 } } }],
	})
	assert.deepEqual(shape, {
		stopReason: 'tool_use',
		blockTypes: 'tool_use',
		toolInputKeys: 'next_goal,action',
		actionKeys: 'index',
		actionIsString: undefined,
	})
	assert.equal(JSON.stringify(shape).includes('SECRET'), false)
})
