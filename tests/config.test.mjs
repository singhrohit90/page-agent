import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { loadConfig } from '../server/config.mjs'

function project(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-config-'))
	for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, name), text)
	return root
}

test('settings come from llm.config.json and the key from .env', () => {
	const root = project({
		'llm.config.json': JSON.stringify({ mode: 'live', provider: 'anthropic', model: 'm1', anthropic: { strict: true } }),
		'.env': 'LLM_API_KEY=secret-1\n',
	})
	const cfg = loadConfig({}, root)
	assert.equal(cfg.mode, 'live')
	assert.equal(cfg.provider, 'anthropic')
	assert.equal(cfg.model, 'm1')
	assert.equal(cfg.anthropicStrict, true)
	assert.equal(cfg.apiKey, 'secret-1')
	assert.deepEqual(cfg.warnings, [])
})

test('non-secret keys in .env are ignored with a visible warning that never prints values', () => {
	const root = project({
		'llm.config.json': JSON.stringify({ model: 'from-config' }),
		'.env': 'LLM_API_KEY=secret-2\nLLM_MODEL=from-env\n',
	})
	const cfg = loadConfig({}, root)
	assert.equal(cfg.model, 'from-config')
	assert.equal(cfg.warnings.length, 1)
	assert.match(cfg.warnings[0], /LLM_MODEL/)
	assert.equal(cfg.warnings[0].includes('from-env'), false)
	assert.equal(cfg.warnings[0].includes('secret-2'), false)
})

test('process environment overrides the config file, which is how the tests run', () => {
	const root = project({ 'llm.config.json': JSON.stringify({ mode: 'live', port: 9000 }) })
	const cfg = loadConfig({ LLM_MODE: 'mock', PORT: '9100', DEMO_SKIP_ENV_FILE: '1' }, root)
	assert.equal(cfg.mode, 'mock')
	assert.equal(cfg.port, 9100)
})

test('unknown config fields warn, invalid JSON fails loudly', () => {
	const warn = loadConfig({}, project({ 'llm.config.json': JSON.stringify({ modle: 'x', anthropic: { stict: true } }) }))
	assert.equal(warn.warnings.length, 2)
	assert.throws(() => loadConfig({}, project({ 'llm.config.json': '{ nope' })), /not valid JSON/)
})

test('defaults apply when there is no config file', () => {
	const cfg = loadConfig({ DEMO_SKIP_ENV_FILE: '1' }, project({}))
	assert.equal(cfg.mode, 'mock')
	assert.equal(cfg.hasKey, false)
})
