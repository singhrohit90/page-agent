/**
 * Translation between page-agent's OpenAI-style chat requests and Anthropic's native Messages API.
 * Pure functions, no I/O. The proxy passes model output through unchanged: tool_use input is
 * re-serialized as tool_call arguments and never repaired, so a malformed action stays visible.
 */

export const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096

/** Thrown for a request that cannot be translated. The proxy turns it into a visible HTTP 400. */
export class TranslationError extends Error {
	constructor(message) {
		super(message)
		this.name = 'TranslationError'
	}
}

// Fields consumed by the translation. Everything else is dropped and counted (see droppedFields).
// tool_choice, parallel_tool_calls and reasoning_effort are OpenAI-only and intentionally not sent.
const CONSUMED = new Set([
	'model',
	'messages',
	'tools',
	'max_tokens',
	'max_completion_tokens',
	'temperature',
	'thinking',
	'tool_choice',
	'parallel_tool_calls',
	'reasoning_effort',
	'stream',
])

function textOf(content, where) {
	if (content === null || content === undefined) return ''
	if (typeof content === 'string') return content
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (part?.type === 'text' && typeof part.text === 'string') return part.text
				throw new TranslationError(`${where}: unsupported content part "${part?.type}" (text only)`)
			})
			.join('\n')
	}
	throw new TranslationError(`${where}: content must be a string or an array of text parts`)
}

function userBlocks(content, where) {
	if (typeof content === 'string') return content === '' ? [] : [{ type: 'text', text: content }]
	if (Array.isArray(content)) {
		return content.map((part) => {
			if (part?.type === 'text' && typeof part.text === 'string') return { type: 'text', text: part.text }
			throw new TranslationError(`${where}: unsupported content part "${part?.type}" (text only)`)
		})
	}
	throw new TranslationError(`${where}: content must be a string or an array of text parts`)
}

function toBlocks(content) {
	return typeof content === 'string' ? (content === '' ? [] : [{ type: 'text', text: content }]) : content
}

function pushMessage(out, role, content) {
	const prev = out[out.length - 1]
	// Consecutive same-role messages are merged: tool results and a following user text must share
	// one user message, and the Messages API expects alternating roles.
	if (prev && prev.role === role) {
		prev.content = [...toBlocks(prev.content), ...toBlocks(content)]
		return
	}
	out.push({ role, content })
}

function assistantContent(m, where) {
	const blocks = []
	const text = textOf(m.content, where)
	if (text !== '') blocks.push({ type: 'text', text })
	for (const [i, call] of (m.tool_calls ?? []).entries()) {
		const name = call?.function?.name
		if (typeof call?.id !== 'string' || typeof name !== 'string') {
			throw new TranslationError(`${where}.tool_calls[${i}]: id and function.name are required`)
		}
		const raw = call.function.arguments
		let input = {}
		if (typeof raw === 'string' && raw.trim() !== '') {
			try {
				input = JSON.parse(raw)
			} catch {
				throw new TranslationError(`${where}.tool_calls[${i}]: function.arguments is not valid JSON`)
			}
		} else if (raw && typeof raw === 'object') {
			input = raw
		}
		if (input === null || typeof input !== 'object' || Array.isArray(input)) {
			throw new TranslationError(`${where}.tool_calls[${i}]: function.arguments must be a JSON object`)
		}
		blocks.push({ type: 'tool_use', id: call.id, name, input })
	}
	if (blocks.length === 0) throw new TranslationError(`${where}: assistant message has no content and no tool_calls`)
	return blocks
}

/** Keywords the strict tool schema subset does not accept. Their meaning moves into the description. */
const STRICT_STRIP = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'default', '$schema']

/**
 * Makes a JSON schema fit Anthropic's strict tool use subset: additionalProperties:false on every
 * object, no numeric or length constraints, nullable rewritten as anyOf with null.
 * NOT verified against the real API in this repo's environment, which is why strict is opt-in.
 */
export function toStrictSchema(schema) {
	if (Array.isArray(schema)) return schema.map(toStrictSchema)
	if (schema === null || typeof schema !== 'object') return schema
	const out = {}
	const notes = []
	for (const [k, v] of Object.entries(schema)) {
		if (STRICT_STRIP.includes(k)) {
			if (k !== '$schema' && k !== 'default') notes.push(`${k} ${JSON.stringify(v)}`)
			continue
		}
		if (k === 'minItems' && v > 1) {
			notes.push(`minItems ${v}`)
			continue
		}
		if (k === 'properties' && v && typeof v === 'object') {
			out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toStrictSchema(pv)]))
		} else if (k === 'nullable') {
			continue
		} else {
			out[k] = toStrictSchema(v)
		}
	}
	if (out.type === 'object' || out.properties) out.additionalProperties = false
	if (notes.length > 0) {
		const note = `(constraints not enforced by the schema: ${notes.join(', ')})`
		out.description = out.description ? `${out.description} ${note}` : note
	}
	if (schema.nullable === true) {
		return { anyOf: [out, { type: 'null' }] }
	}
	return out
}

/**
 * OpenAI chat body -> native Messages body.
 * options: { model, thinking: 'between_tools' | 'omit', strict: boolean }
 * Returns { body, shape } where shape is a content-free summary safe to log.
 */
export function toAnthropicRequest(openai, options) {
	if (!openai || typeof openai !== 'object') throw new TranslationError('Request body must be a JSON object')
	if (openai.stream === true) throw new TranslationError('stream is not supported by the demo proxy')
	if (!Array.isArray(openai.messages)) throw new TranslationError('messages must be an array')

	const system = []
	const messages = []
	for (const [i, m] of openai.messages.entries()) {
		const where = `messages[${i}]`
		switch (m?.role) {
			case 'system':
			case 'developer': {
				const text = textOf(m.content, where)
				if (text !== '') system.push(text)
				break
			}
			case 'user': {
				const blocks = userBlocks(m.content, where)
				if (blocks.length === 0) throw new TranslationError(`${where}: user message is empty`)
				pushMessage(messages, 'user', typeof m.content === 'string' ? m.content : blocks)
				break
			}
			case 'assistant': {
				const hasCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0
				if (!hasCalls && typeof m.content === 'string' && m.content !== '') {
					pushMessage(messages, 'assistant', m.content)
				} else {
					pushMessage(messages, 'assistant', assistantContent(m, where))
				}
				break
			}
			case 'tool': {
				if (typeof m.tool_call_id !== 'string') throw new TranslationError(`${where}: tool_call_id is required`)
				pushMessage(messages, 'user', [
					{ type: 'tool_result', tool_use_id: m.tool_call_id, content: textOf(m.content, where) },
				])
				break
			}
			default:
				throw new TranslationError(`${where}: unsupported role "${m?.role}"`)
		}
	}
	if (messages.length === 0) throw new TranslationError('messages must contain at least one non-system message')

	const maxTokens = openai.max_tokens ?? openai.max_completion_tokens ?? DEFAULT_MAX_TOKENS
	if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new TranslationError('max_tokens must be a positive integer')

	const body = { model: options.model, max_tokens: maxTokens, messages }
	if (system.length > 0) body.system = system.join('\n\n')

	const tools = Array.isArray(openai.tools) ? openai.tools : []
	if (tools.length > 0) {
		body.tools = tools.map((t, i) => {
			const fn = t?.function
			if (t?.type !== 'function' || typeof fn?.name !== 'string') {
				throw new TranslationError(`tools[${i}]: only function tools with a name are supported`)
			}
			const schema = fn.parameters ?? { type: 'object', properties: {} }
			const def = { name: fn.name, input_schema: options.strict ? toStrictSchema(schema) : schema }
			if (typeof fn.description === 'string' && fn.description !== '') def.description = fn.description
			if (options.strict) def.strict = true
			return def
		})
	}
	if (typeof openai.temperature === 'number' && Number.isFinite(openai.temperature)) {
		body.temperature = openai.temperature
	}
	// tool_choice is never sent: the target model rejects forced tool use ("tool" and "any").
	let thinkingSent = 'none'
	if (options.thinking === 'between_tools' && openai.thinking?.type === 'disabled') {
		body.thinking = { type: 'between_tools' }
		thinkingSent = 'between_tools'
	}

	const shape = {
		toolCount: tools.length,
		toolChoiceSent: false,
		thinkingSent,
		strict: Boolean(options.strict),
		maxTokens,
		messageCount: messages.length,
		droppedFields: Object.keys(openai).filter((k) => !CONSUMED.has(k)).length,
	}
	return { body, shape }
}

const FINISH = {
	tool_use: 'tool_calls',
	end_turn: 'stop',
	stop_sequence: 'stop',
	max_tokens: 'length',
	refusal: 'content_filter',
	model_context_window_exceeded: 'length',
}

/**
 * Native Messages reply -> OpenAI chat.completion. Throws TranslationError when the reply is not a
 * Messages object. Unknown stop reasons are passed through so page-agent reports them verbatim.
 */
export function fromAnthropicResponse(msg) {
	if (!msg || msg.type !== 'message' || !Array.isArray(msg.content)) {
		throw new TranslationError('Upstream reply is not a Messages API message')
	}
	const text = msg.content
		.filter((b) => b?.type === 'text' && typeof b.text === 'string')
		.map((b) => b.text)
		.join('')
	const toolCalls = msg.content
		.filter((b) => b?.type === 'tool_use')
		.map((b) => ({
			id: b.id,
			type: 'function',
			function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
		}))
	const message = { role: 'assistant', content: text === '' ? null : text }
	if (toolCalls.length > 0) message.tool_calls = toolCalls
	const input = Number(msg.usage?.input_tokens) || 0
	const output = Number(msg.usage?.output_tokens) || 0
	return {
		id: msg.id,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		model: msg.model,
		choices: [{ index: 0, message, finish_reason: FINISH[msg.stop_reason] ?? String(msg.stop_reason) }],
		usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
	}
}

/** Native error JSON ({type:'error', error:{type,message}}) -> short message for {error:{message}}. */
export function anthropicErrorMessage(parsed) {
	const message = parsed?.error?.message
	return typeof message === 'string' ? message.slice(0, 300) : 'Upstream error'
}
