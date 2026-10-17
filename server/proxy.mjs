import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { loadConfig, validateConfig } from './config.mjs'
import { createLogger } from './log.mjs'
import { mockCompletion } from './mock-llm.mjs'
import { forward } from './upstream.mjs'

const PAGE_AGENT_VERSION = '1.12.4'
const MAX_BODY = 2 * 1024 * 1024
const COOKIE_NAME = 'pa_demo_session'

const cfg = loadConfig()
for (const w of cfg.warnings) console.warn(`WARNING: ${w}`)
const problem = validateConfig(cfg)
if (problem) {
	console.error(problem)
	process.exit(1)
}

const log = createLogger(cfg.logFile)
const sessions = new Set()
const hits = new Map() // session -> timestamps (ms) of LLM calls in the last minute

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
	'Content-Security-Policy':
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'no-referrer',
}

function sessionFrom(req) {
	const header = req.headers.cookie
	if (!header) return null
	for (const part of header.split(';')) {
		const [k, ...rest] = part.trim().split('=')
		if (k === COOKIE_NAME) {
			const v = rest.join('=')
			return sessions.has(v) ? v : null
		}
	}
	return null
}

function sessionTag(session) {
	return crypto.createHash('sha256').update(session).digest('hex').slice(0, 8)
}

function sendJson(res, status, obj, extraHeaders = {}) {
	const text = JSON.stringify(obj)
	res.writeHead(status, {
		...SECURITY_HEADERS,
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
		...extraHeaders,
	})
	res.end(text)
}

/** Reads the body up to MAX_BODY bytes. Resolves { tooLarge: true } when exceeded. */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const declared = Number(req.headers['content-length'] ?? 0)
		if (declared > MAX_BODY) {
			req.resume()
			resolve({ tooLarge: true })
			return
		}
		const chunks = []
		let size = 0
		let over = false
		req.on('data', (chunk) => {
			if (over) return
			size += chunk.length
			if (size > MAX_BODY) {
				over = true
				chunks.length = 0
				return
			}
			chunks.push(chunk)
		})
		req.on('end', () => resolve(over ? { tooLarge: true } : { text: Buffer.concat(chunks).toString('utf8') }))
		req.on('error', reject)
	})
}

function rateLimited(session) {
	const now = Date.now()
	const list = (hits.get(session) ?? []).filter((t) => now - t < 60_000)
	if (list.length >= cfg.rateLimitPerMinute) {
		hits.set(session, list)
		return true
	}
	list.push(now)
	hits.set(session, list)
	return false
}

async function handleLlm(req, res) {
	const started = Date.now()
	const base = { kind: 'llm', mode: cfg.mode, provider: cfg.mode === 'mock' ? 'mock' : cfg.provider, model: cfg.mode === 'mock' ? 'mock-scripted' : cfg.model }
	const done = (status, extra = {}) => log({ ...base, status, durationMs: Date.now() - started, ...extra })

	const session = sessionFrom(req)
	if (!session) {
		sendJson(res, 401, { error: { message: 'No demo session' } })
		done(401, { errorType: 'unauthorized' })
		return
	}
	const tag = sessionTag(session)

	const body = await readBody(req)
	if (body.tooLarge) {
		sendJson(res, 413, { error: { message: 'Request body too large' } })
		done(413, { session: tag, errorType: 'too_large' })
		return
	}
	let parsed
	try {
		parsed = JSON.parse(body.text)
	} catch {
		sendJson(res, 400, { error: { message: 'Invalid JSON' } })
		done(400, { session: tag, errorType: 'bad_json' })
		return
	}
	if (JSON.stringify(parsed?.tools ?? null).includes('execute_javascript')) {
		sendJson(res, 400, { error: { message: 'execute_javascript is not allowed' } })
		done(400, { session: tag, errorType: 'forbidden_tool' })
		return
	}
	if (rateLimited(session)) {
		sendJson(res, 429, { error: { message: `Demo proxy rate limit: ${cfg.rateLimitPerMinute} requests per minute` } })
		done(429, { session: tag, errorType: 'rate_limited' })
		return
	}

	if (cfg.mode === 'mock') {
		const json = await mockCompletion(parsed)
		sendJson(res, 200, json)
		done(200, {
			session: tag,
			promptTokens: json.usage.prompt_tokens,
			completionTokens: json.usage.completion_tokens,
			totalTokens: json.usage.total_tokens,
		})
		return
	}

	const result = await forward(cfg, parsed, {
		// Request shape only (counts and flags), never message or tool content.
		onShape: (shape) => log({ ...base, kind: 'llm_request_shape', session: tag, ...shape }),
		// Response shape: key names only, never values.
		onResponseShape: (shape) => log({ ...base, kind: 'llm_response_shape', session: tag, ...shape }),
	})
	sendJson(res, result.status, result.json)
	const usage = result.json?.usage
	done(result.status, {
		session: tag,
		upstreamStatus: result.upstreamStatus,
		errorType: result.errorType,
		promptTokens: usage?.prompt_tokens,
		completionTokens: usage?.completion_tokens,
		totalTokens: usage?.total_tokens,
	})
}

async function handleAudit(req, res) {
	const session = sessionFrom(req)
	if (!session) {
		sendJson(res, 401, { error: { message: 'No demo session' } })
		return
	}
	const body = await readBody(req)
	if (body.tooLarge) {
		sendJson(res, 413, { error: { message: 'Request body too large' } })
		return
	}
	let parsed
	try {
		parsed = JSON.parse(body.text)
	} catch {
		sendJson(res, 400, { error: { message: 'Invalid JSON' } })
		return
	}
	const str = (v) => (typeof v === 'string' ? v.slice(0, 64) : undefined)
	const num = (v) => (Number.isFinite(v) ? v : undefined)
	const gate = ['approved', 'denied', 'blocked-unresolved', 'refused-missing-fields'].includes(parsed?.gate) ? parsed.gate : null
	log({
		kind: 'audit',
		status: 204,
		session: sessionTag(session),
		taskId: str(parsed?.taskId),
		stepIndex: num(parsed?.stepIndex),
		action: str(parsed?.action),
		promptTokens: num(parsed?.promptTokens),
		completionTokens: num(parsed?.completionTokens),
		totalTokens: num(parsed?.totalTokens),
		gate,
	})
	res.writeHead(204, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' })
	res.end()
}

function serveStatic(req, res, pathname) {
	const root = cfg.staticDir
	let rel
	try {
		rel = decodeURIComponent(pathname)
	} catch {
		sendJson(res, 400, { error: { message: 'Bad path' } })
		return
	}
	const target = path.resolve(root, '.' + path.posix.normalize('/' + rel))
	if (target !== root && !target.startsWith(root + path.sep)) {
		sendJson(res, 404, { error: { message: 'Not found' } })
		return
	}
	let file = target
	let isIndex = false
	let stat = null
	try {
		stat = fs.statSync(file)
	} catch {
		stat = null
	}
	if (!stat || !stat.isFile()) {
		file = path.join(root, 'index.html')
		isIndex = true
	} else if (path.basename(file) === 'index.html') {
		isIndex = true
	}

	const headers = {
		...SECURITY_HEADERS,
		'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
	}
	if (isIndex) {
		headers['Cache-Control'] = 'no-store'
		if (!sessionFrom(req)) {
			const id = crypto.randomBytes(16).toString('hex')
			sessions.add(id)
			headers['Set-Cookie'] = `${COOKIE_NAME}=${id}; HttpOnly; SameSite=Strict; Path=/`
		}
	}
	res.writeHead(200, headers)
	if (req.method === 'HEAD') {
		res.end()
		return
	}
	fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost')
	const pathname = url.pathname
	const handle = async () => {
		if (pathname.startsWith('/api/')) {
			if (pathname === '/api/health') {
				if (req.method !== 'GET') return sendJson(res, 405, { error: { message: 'Method not allowed' } })
				return sendJson(res, 200, {
					ok: true,
					mode: cfg.mode,
					provider: cfg.mode === 'mock' ? 'mock' : cfg.provider,
					model: cfg.mode === 'mock' ? 'mock-scripted' : cfg.model,
					pageAgentVersion: PAGE_AGENT_VERSION,
				})
			}
			if (pathname === '/api/llm/chat/completions') {
				if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'Method not allowed' } })
				return handleLlm(req, res)
			}
			if (pathname === '/api/audit') {
				if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'Method not allowed' } })
				return handleAudit(req, res)
			}
			return sendJson(res, 404, { error: { message: 'Not found' } })
		}
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			return sendJson(res, 405, { error: { message: 'Method not allowed' } })
		}
		return serveStatic(req, res, pathname)
	}
	handle().catch((err) => {
		process.stderr.write(`request failed: ${err?.code ?? err?.name ?? 'error'}\n`)
		if (!res.headersSent) sendJson(res, 500, { error: { message: 'Internal error' } })
		else res.end()
	})
})

server.on('error', (err) => {
	console.error(err.code === 'EADDRINUSE' ? `Port ${cfg.port} is in use. Set port in llm.config.json` : `Server error: ${err.code ?? err.name}`)
	process.exit(1)
})

server.listen(cfg.port, '127.0.0.1', () => {
	const live = cfg.mode === 'live'
	console.log(
		`TestFloor demo on http://localhost:${cfg.port}  mode=${cfg.mode} provider=${live ? cfg.provider : 'mock'} model=${live ? cfg.model : 'mock-scripted'} key=${cfg.hasKey ? 'set' : 'not set'}`
	)
	log({ kind: 'startup', mode: cfg.mode, provider: live ? cfg.provider : 'mock', model: live ? cfg.model : 'mock-scripted' })
})
