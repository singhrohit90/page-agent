import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { defaultReply, startFakeAnthropic } from './fake-anthropic.mjs'

const DEMO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILT = fs.existsSync(path.join(DEMO_ROOT, 'dist', 'demo-app', 'browser', 'index.html'))
const PROXY_KEY = 'test-key-not-real-0001'
const MARKER = 'PAGE-CONTENT-MARKER-7731'

const AGENT_TOOL = {
	type: 'function',
	function: {
		name: 'AgentOutput',
		description: 'You MUST call this tool every step!',
		parameters: {
			type: 'object',
			properties: {
				evaluation_previous_goal: { type: 'string' },
				action: {
					anyOf: [
						{
							type: 'object',
							properties: { ask_user: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'], additionalProperties: false } },
							required: ['ask_user'],
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

// What page-agent 1.12.4 sends for claude-sonnet-5-5: Claude-patched tool_choice, thinking disabled.
function pageAgentRequest(extra = {}) {
	return {
		model: 'claude-sonnet-5-5',
		messages: [
			{ role: 'system', content: 'You are a browser agent.' },
			{ role: 'user', content: `<user_request>${MARKER}</user_request>` },
		],
		tools: [AGENT_TOOL],
		parallel_tool_calls: false,
		tool_choice: { type: 'tool', name: 'AgentOutput' },
		thinking: { type: 'disabled' },
		...extra,
	}
}

async function freePort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer()
		s.listen(0, '127.0.0.1', () => {
			const { port } = s.address()
			s.close(() => resolve(port))
		})
		s.on('error', reject)
	})
}

const cleanups = []
after(async () => {
	for (const fn of cleanups.reverse()) await fn()
})

/** Starts a fake Anthropic and the real proxy (live, provider anthropic) pointed at it. */
async function startStack(fakeOptions = {}, env = {}) {
	const fake = await startFakeAnthropic({ apiKey: PROXY_KEY, ...fakeOptions })
	const port = await freePort()
	const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-anthropic-'))
	const logFile = path.join(logDir, 'proxy.log')
	const child = spawn(process.execPath, ['server/proxy.mjs'], {
		cwd: DEMO_ROOT,
		env: {
			...process.env,
			DEMO_SKIP_ENV_FILE: '1',
			PORT: String(port),
			LLM_MODE: 'live',
			LLM_PROVIDER: 'anthropic',
			LLM_BASE_URL: fake.baseUrl,
			LLM_MODEL: 'claude-sonnet-5-5',
			LLM_API_KEY: PROXY_KEY,
			LOG_FILE: logFile,
			...env,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let stderr = ''
	child.stderr.on('data', (d) => (stderr += d))
	cleanups.push(async () => {
		child.kill()
		await fake.close()
		fs.rmSync(logDir, { recursive: true, force: true })
	})
	const base = `http://127.0.0.1:${port}`
	for (let i = 0; i < 100; i++) {
		if (child.exitCode !== null) throw new Error(`proxy exited early: ${stderr}`)
		try {
			const r = await fetch(`${base}/api/health`)
			if (r.ok) break
		} catch {
			// not listening yet
		}
		await new Promise((r) => setTimeout(r, 100))
	}
	// Session cookie, the same way the smoke tests get it: load the app shell.
	const shell = await fetch(`${base}/`)
	const cookie = shell.headers.get('set-cookie')?.split(';')[0]
	assert.ok(cookie, 'proxy did not issue a session cookie')
	const post = (body, headers = {}) =>
		fetch(`${base}/api/llm/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: base, Referer: `${base}/dashboard`, Authorization: 'Bearer browser-should-not-forward', ...headers },
			body: JSON.stringify(body),
		})
	return { fake, post, logFile }
}

describe('proxy with provider anthropic against a strict fake native API', { skip: BUILT ? false : 'dist/ is missing, run npm run build first' }, () => {
	test('page-agent style request gets an OpenAI-shaped reply and the fake sees only allowed fields', async () => {
		const { fake, post, logFile } = await startStack()
		const res = await post(pageAgentRequest())
		assert.equal(res.status, 200)
		const json = await res.json()
		assert.equal(json.object, 'chat.completion')
		assert.equal(json.choices[0].finish_reason, 'tool_calls')
		const call = json.choices[0].message.tool_calls[0]
		assert.equal(call.function.name, 'AgentOutput')
		assert.equal(JSON.parse(call.function.arguments).action.done.text, 'FAKE ANTHROPIC: done')
		assert.deepEqual(json.usage, { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 })

		assert.equal(fake.requests.length, 1)
		const seen = fake.requests[0]
		assert.equal(seen.rejected, undefined)
		assert.equal(seen.path, '/v1/messages')
		assert.equal(seen.headers['x-api-key'], PROXY_KEY)
		assert.equal(seen.headers['anthropic-version'], '2023-06-01')
		for (const h of ['authorization', 'cookie', 'origin', 'referer']) assert.equal(seen.headers[h], undefined, `forwarded header ${h}`)
		assert.equal('tool_choice' in seen.body, false)
		assert.equal('parallel_tool_calls' in seen.body, false)
		assert.deepEqual(seen.body.thinking, { type: 'between_tools' })
		assert.equal(seen.body.max_tokens, 4096)
		assert.equal(seen.body.system, 'You are a browser agent.')
		assert.equal(seen.body.tools[0].name, 'AgentOutput')
		assert.equal('strict' in seen.body.tools[0], false)

		const log = fs.readFileSync(logFile, 'utf8')
		const shape = log.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((l) => l.kind === 'llm_request_shape')
		assert.ok(shape, 'request shape debug line missing')
		assert.equal(shape.provider, 'anthropic')
		assert.equal(shape.toolCount, 1)
		assert.equal(shape.toolChoiceSent, false)
		assert.equal(shape.thinkingSent, 'between_tools')
		assert.equal(shape.strict, false)
		assert.equal(shape.maxTokens, 4096)
		assert.equal(shape.messageCount, 1)
		const llm = log.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((l) => l.kind === 'llm')
		assert.equal(llm.totalTokens, 133)
		for (const banned of [MARKER, PROXY_KEY, 'browser-should-not-forward', 'AgentOutput', 'browser agent']) {
			assert.equal(log.includes(banned), false, `log contains ${banned}`)
		}
	})

	test('malformed action unions from the model are passed through unchanged, not repaired', async () => {
		const bad = [{ action: { question: 'Which station?' } }, { action: { index: 3 } }]
		let n = 0
		const { post } = await startStack({
			reply: () => ({ ...defaultReply(), content: [{ type: 'tool_use', id: `toolu_bad_${n}`, name: 'AgentOutput', input: bad[n++] }] }),
		})
		for (const input of bad) {
			const json = await (await post(pageAgentRequest())).json()
			assert.equal(json.choices[0].message.tool_calls[0].function.arguments, JSON.stringify(input))
		}
	})

	test('LLM_ANTHROPIC_THINKING=omit sends no thinking, LLM_ANTHROPIC_STRICT=true adds strict', async () => {
		const { fake, post } = await startStack({}, { LLM_ANTHROPIC_THINKING: 'omit', LLM_ANTHROPIC_STRICT: 'true' })
		assert.equal((await post(pageAgentRequest())).status, 200)
		const seen = fake.requests[0]
		assert.equal(seen.rejected, undefined)
		assert.equal('thinking' in seen.body, false)
		assert.equal(seen.body.tools[0].strict, true)
	})

	test('native errors map to the {error:{message}} shape with the upstream status', async () => {
		const { post, fake } = await startStack({ forceError: { status: 429, type: 'rate_limit_error', message: 'slow down '.repeat(60) } })
		const res = await post(pageAgentRequest())
		assert.equal(res.status, 429)
		const json = await res.json()
		assert.deepEqual(Object.keys(json), ['error'])
		assert.equal(json.error.message.length, 300)
		assert.equal(fake.requests.length, 1)
	})

	test('an untranslatable request is a visible 400 and never reaches the upstream', async () => {
		const { post, fake } = await startStack()
		const res = await post({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }] })
		assert.equal(res.status, 400)
		assert.match((await res.json()).error.message, /text only/)
		assert.equal(fake.requests.length, 0)
	})

	test('execute_javascript in the tool schema is still rejected before any upstream call', async () => {
		const { post, fake } = await startStack()
		const body = pageAgentRequest()
		body.tools[0].function.description = 'execute_javascript'
		const res = await post(body)
		assert.equal(res.status, 400)
		assert.equal(fake.requests.length, 0)
	})
})
