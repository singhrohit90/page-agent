import {
	ANTHROPIC_VERSION,
	TranslationError,
	anthropicErrorMessage,
	fromAnthropicResponse,
	toAnthropicRequest,
} from './anthropic-native.mjs'

/**
 * Key names only (short, capped), never values: shows how the model shaped its tool call so a
 * malformed action union such as {"index": 5} is diagnosable without logging any content.
 */
export function describeAnthropicResponse(msg) {
	const keys = (o) =>
		o && typeof o === 'object' && !Array.isArray(o)
			? Object.keys(o)
					.slice(0, 10)
					.map((k) => String(k).slice(0, 40))
					.join(',')
			: undefined
	const blocks = Array.isArray(msg?.content) ? msg.content : []
	const toolUse = blocks.find((b) => b?.type === 'tool_use')
	return {
		stopReason: typeof msg?.stop_reason === 'string' ? msg.stop_reason.slice(0, 40) : undefined,
		blockTypes: blocks
			.slice(0, 10)
			.map((b) => String(b?.type).slice(0, 20))
			.join(','),
		toolInputKeys: keys(toolUse?.input),
		actionKeys: keys(toolUse?.input?.action),
		actionIsString: typeof toolUse?.input?.action === 'string' ? true : undefined,
	}
}

/**
 * Builds the upstream request. Incoming headers are never forwarded.
 * Returns { url, headers, body, shape? }. provider=anthropic calls the native Messages API and
 * returns a content-free request `shape` for the debug log; it throws TranslationError on a body
 * that cannot be translated.
 */
export function buildUpstream(cfg, body) {
	if (cfg.provider === 'anthropic') {
		const { body: native, shape } = toAnthropicRequest(body, {
			model: cfg.model,
			thinking: cfg.anthropicThinking ?? 'between_tools',
			strict: cfg.anthropicStrict === true,
		})
		const headers = {
			'Content-Type': 'application/json',
			'x-api-key': cfg.apiKey,
			'anthropic-version': ANTHROPIC_VERSION,
		}
		if (cfg.anthropicBeta) headers['anthropic-beta'] = cfg.anthropicBeta
		return { url: `${cfg.baseUrl}/messages`, headers, body: JSON.stringify(native), shape }
	}

	const forwarded = { ...body, model: cfg.model }
	if (cfg.stripToolChoice) delete forwarded.tool_choice

	const headers = { 'Content-Type': 'application/json' }
	let url
	if (cfg.provider === 'azure') {
		url = `${cfg.baseUrl}/openai/deployments/${encodeURIComponent(cfg.azureDeployment)}/chat/completions?api-version=${encodeURIComponent(cfg.azureApiVersion)}`
		headers['api-key'] = cfg.apiKey
	} else {
		// openai and generic share the OpenAI-style path and Bearer auth.
		url = `${cfg.baseUrl}/chat/completions`
		if (cfg.hasKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`
	}
	return { url, headers, body: JSON.stringify(forwarded) }
}

/**
 * Returns { status, json, errorType?, upstreamStatus? }.
 * Upstream 2xx: JSON unchanged (provider anthropic: translated to chat.completion, model output
 * otherwise untouched). Non-2xx: same status with a short error message.
 * hooks.onShape(shape) is called before the upstream request (provider anthropic only).
 */
export async function forward(cfg, body, hooks = {}) {
	let up
	try {
		up = buildUpstream(cfg, body)
	} catch (err) {
		if (err instanceof TranslationError) {
			return { status: 400, json: { error: { message: err.message.slice(0, 300) } }, errorType: 'bad_request' }
		}
		throw err
	}
	if (up.shape) hooks.onShape?.(up.shape)

	let res
	try {
		res = await fetch(up.url, {
			method: 'POST',
			headers: up.headers,
			body: up.body,
			signal: AbortSignal.timeout(cfg.timeoutMs),
		})
	} catch (err) {
		if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
			return { status: 504, json: { error: { message: 'Upstream timeout' } }, errorType: 'timeout' }
		}
		return { status: 502, json: { error: { message: 'Upstream unreachable' } }, errorType: 'network' }
	}

	let text = ''
	try {
		text = await res.text()
	} catch {
		return { status: 502, json: { error: { message: 'Upstream unreachable' } }, errorType: 'network' }
	}
	let parsed
	try {
		parsed = JSON.parse(text)
	} catch {
		parsed = undefined
	}

	if (!res.ok) {
		const message =
			cfg.provider === 'anthropic'
				? anthropicErrorMessage(parsed)
				: typeof parsed?.error?.message === 'string'
					? parsed.error.message.slice(0, 300)
					: 'Upstream error'
		return {
			status: res.status,
			json: { error: { message } },
			errorType: 'upstream_http',
			upstreamStatus: res.status,
		}
	}
	if (parsed === undefined) {
		return { status: 502, json: { error: { message: 'Upstream error' } }, errorType: 'upstream_http', upstreamStatus: res.status }
	}
	if (cfg.provider === 'anthropic') {
		try {
			hooks.onResponseShape?.(describeAnthropicResponse(parsed))
			return { status: res.status, json: fromAnthropicResponse(parsed), upstreamStatus: res.status }
		} catch (err) {
			if (!(err instanceof TranslationError)) throw err
			return {
				status: 502,
				json: { error: { message: err.message } },
				errorType: 'upstream_shape',
				upstreamStatus: res.status,
			}
		}
	}
	return { status: res.status, json: parsed, upstreamStatus: res.status }
}
