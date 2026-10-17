import fs from 'node:fs'
import path from 'node:path'

/** Metadata-only logger. Any key not in this list is dropped. */
const ALLOWED = new Set([
	'ts',
	'kind',
	'status',
	'durationMs',
	'mode',
	'provider',
	'model',
	'promptTokens',
	'completionTokens',
	'totalTokens',
	'upstreamStatus',
	'session',
	'taskId',
	'stepIndex',
	'action',
	'gate',
	'errorType',
	// Request shape for provider anthropic: counts and flags only.
	'toolCount',
	'toolChoiceSent',
	'thinkingSent',
	'strict',
	'maxTokens',
	'messageCount',
	'droppedFields',
	// Response shape for provider anthropic: key names only.
	'stopReason',
	'blockTypes',
	'toolInputKeys',
	'actionKeys',
	'actionIsString',
])

export function createLogger(logFile) {
	fs.mkdirSync(path.dirname(logFile), { recursive: true })
	return function log(entry) {
		const line = {}
		for (const [k, v] of Object.entries({ ts: new Date().toISOString(), ...entry })) {
			if (ALLOWED.has(k) && v !== undefined) line[k] = v
		}
		const text = JSON.stringify(line)
		process.stdout.write(text + '\n')
		try {
			fs.appendFileSync(logFile, text + '\n')
		} catch (err) {
			process.stderr.write(`log write failed: ${err.code ?? 'error'}\n`)
		}
	}
}
