/**
 * Strict fake of Anthropic's native Messages API, for tests only. It enforces the rules we know
 * from real errors seen against claude-sonnet-5-5 and answers in the native reply shape.
 * It records every request (headers and parsed body) so tests can assert what was sent.
 */
import http from 'node:http'

const ALLOWED_TOP = new Set([
	'model',
	'messages',
	'max_tokens',
	'system',
	'tools',
	'tool_choice',
	'thinking',
	'temperature',
	'top_p',
	'top_k',
	'stop_sequences',
	'stream',
	'metadata',
	'service_tier',
])
const ALLOWED_TOOL = new Set(['name', 'description', 'input_schema', 'strict', 'type', 'cache_control'])

class Reject extends Error {
	constructor(message, status = 400, type = 'invalid_request_error') {
		super(message)
		this.status = status
		this.type = type
	}
}

function validate(headers, body, apiKey) {
	if (headers['x-api-key'] !== apiKey) throw new Reject('invalid x-api-key', 401, 'authentication_error')
	if (!headers['anthropic-version']) throw new Reject('anthropic-version: header is required')
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Reject('body must be a JSON object')
	for (const key of Object.keys(body)) {
		if (!ALLOWED_TOP.has(key)) throw new Reject(`${key}: Extra inputs are not permitted`)
	}
	if (typeof body.model !== 'string') throw new Reject('model: Field required')
	if (body.max_tokens === undefined) throw new Reject('max_tokens: Field required')
	if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) throw new Reject('max_tokens: Input should be a positive integer')
	if (body.stream === true) throw new Reject('stream: not supported by this fake')
	if (body.system !== undefined && typeof body.system !== 'string' && !Array.isArray(body.system)) {
		throw new Reject('system: Input should be a valid string')
	}
	if (body.tool_choice !== undefined) {
		const type = body.tool_choice?.type
		if (type === 'tool' || type === 'any') {
			throw new Reject('tool_choice: type "tool" and "any" are not supported for this model.')
		}
		if (!['auto', 'none'].includes(type)) throw new Reject('tool_choice: Input should be "auto", "any", "tool" or "none"')
	}
	if (body.thinking !== undefined) {
		const type = body.thinking?.type
		if (type === 'disabled') {
			throw new Reject('To turn thinking off on this model, send "thinking": {"type": "between_tools"} instead of {"type": "disabled"}.')
		}
		if (!['between_tools', 'enabled', 'adaptive'].includes(type)) throw new Reject('thinking.type: Input should be a known thinking type')
	}
	const toolNames = new Set()
	for (const [i, t] of (body.tools ?? []).entries()) {
		for (const key of Object.keys(t)) {
			if (!ALLOWED_TOOL.has(key)) throw new Reject(`tools.${i}.${key}: Extra inputs are not permitted`)
		}
		if (typeof t.name !== 'string' || t.name === '') throw new Reject(`tools.${i}.name: Field required`)
		if (t.input_schema?.type !== 'object') throw new Reject(`tools.${i}.input_schema.type: Input should be 'object'`)
		toolNames.add(t.name)
	}
	if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Reject('messages: at least one message is required')
	let prevToolUseIds = new Set()
	for (const [i, m] of body.messages.entries()) {
		if (m?.role !== 'user' && m?.role !== 'assistant') {
			throw new Reject(`messages.${i}.role: Input should be 'user' or 'assistant'`)
		}
		if (i === 0 && m.role !== 'user') throw new Reject('messages: first message must use the "user" role')
		if (i > 0 && body.messages[i - 1].role === m.role) throw new Reject(`messages.${i}: roles must alternate`)
		const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
		if (!Array.isArray(blocks) || blocks.length === 0) throw new Reject(`messages.${i}.content: must not be empty`)
		const nextToolUseIds = new Set()
		for (const b of blocks) {
			if (b.type === 'text' && b.text === '') throw new Reject(`messages.${i}: text content blocks must be non-empty`)
			if (b.type === 'tool_use') {
				if (m.role !== 'assistant') throw new Reject(`messages.${i}: tool_use blocks belong to assistant messages`)
				if (typeof b.input !== 'object' || b.input === null) throw new Reject(`messages.${i}: tool_use.input must be an object`)
				nextToolUseIds.add(b.id)
			}
			if (b.type === 'tool_result' && !prevToolUseIds.has(b.tool_use_id)) {
				throw new Reject(`messages.${i}: tool_result has no matching tool_use in the previous message`)
			}
		}
		prevToolUseIds = nextToolUseIds
	}
	return toolNames
}

/** Default reply: a well-formed AgentOutput tool_use with a done action. */
export function defaultReply() {
	return {
		content: [
			{ type: 'thinking', thinking: 'fake reasoning', signature: 'sig' },
			{
				type: 'tool_use',
				id: 'toolu_fake_1',
				name: 'AgentOutput',
				input: {
					evaluation_previous_goal: 'fake: ok',
					memory: 'fake memory',
					next_goal: 'finish',
					action: { done: { text: 'FAKE ANTHROPIC: done', success: true } },
				},
			},
		],
		stop_reason: 'tool_use',
		usage: { input_tokens: 111, output_tokens: 22 },
	}
}

/**
 * options.apiKey: expected key. options.reply(body): returns { content, stop_reason, usage } (default
 * defaultReply). options.forceError: { status, type, message } makes every call fail natively.
 */
export async function startFakeAnthropic(options = {}) {
	const apiKey = options.apiKey ?? 'fake-anthropic-key-0001'
	const requests = []
	const server = http.createServer((req, res) => {
		const chunks = []
		req.on('data', (c) => chunks.push(c))
		req.on('end', () => {
			const send = (status, obj) => {
				res.writeHead(status, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify(obj))
			}
			const fail = (status, type, message) =>
				send(status, { type: 'error', error: { type, message }, request_id: 'req_fake' })
			let body
			try {
				body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
			} catch {
				body = undefined
			}
			const record = { method: req.method, path: req.url, headers: req.headers, body }
			requests.push(record)
			if (req.method !== 'POST' || req.url !== '/v1/messages') return fail(404, 'not_found_error', `no route ${req.method} ${req.url}`)
			if (options.forceError) return fail(options.forceError.status, options.forceError.type, options.forceError.message)
			try {
				validate(req.headers, body, apiKey)
			} catch (err) {
				if (err instanceof Reject) {
					record.rejected = err.message
					return fail(err.status, err.type, err.message)
				}
				throw err
			}
			const reply = (options.reply ?? defaultReply)(body)
			send(200, {
				id: 'msg_fake_1',
				type: 'message',
				role: 'assistant',
				model: body.model,
				stop_sequence: null,
				...reply,
			})
		})
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	return {
		baseUrl: `http://127.0.0.1:${port}/v1`,
		apiKey,
		requests,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	}
}
