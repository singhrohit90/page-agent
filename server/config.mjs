import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEMO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The only value read from .env. Everything else lives in llm.config.json. */
const SECRET_KEYS = ['LLM_API_KEY']

/** Non-secret settings: llm.config.json field -> process env override name (used by tests and CI). */
const SETTINGS = {
	mode: 'LLM_MODE',
	provider: 'LLM_PROVIDER',
	baseUrl: 'LLM_BASE_URL',
	model: 'LLM_MODEL',
	stripToolChoice: 'LLM_STRIP_TOOL_CHOICE',
	timeoutMs: 'LLM_TIMEOUT_MS',
	rateLimitPerMinute: 'RATE_LIMIT_PER_MINUTE',
	port: 'PORT',
	logFile: 'LOG_FILE',
}
const NESTED = {
	azure: { deployment: 'AZURE_DEPLOYMENT', apiVersion: 'AZURE_API_VERSION' },
	anthropic: { thinking: 'LLM_ANTHROPIC_THINKING', strict: 'LLM_ANTHROPIC_STRICT', beta: 'LLM_ANTHROPIC_BETA' },
}

const DEFAULTS = {
	LLM_MODE: 'mock',
	LLM_PROVIDER: 'openai',
	LLM_BASE_URL: 'https://api.openai.com/v1',
	LLM_MODEL: 'gpt-5.4-mini',
	AZURE_DEPLOYMENT: '',
	AZURE_API_VERSION: '2024-10-21',
	LLM_STRIP_TOOL_CHOICE: 'false',
	LLM_ANTHROPIC_THINKING: 'between_tools',
	LLM_ANTHROPIC_STRICT: 'false',
	LLM_ANTHROPIC_BETA: '',
	LLM_TIMEOUT_MS: '90000',
	RATE_LIMIT_PER_MINUTE: '30',
	PORT: '8787',
	LOG_FILE: 'logs/proxy.log',
}

/** Minimal .env parser: KEY=VALUE, # comments, blank lines, optional quotes, no interpolation. */
export function parseEnv(text) {
	const out = {}
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (!line || line.startsWith('#')) continue
		const eq = line.indexOf('=')
		if (eq < 1) continue
		const key = line.slice(0, eq).trim()
		let value = line.slice(eq + 1).trim()
		if (
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
		) {
			value = value.slice(1, -1)
		}
		out[key] = value
	}
	return out
}

/** Flattens llm.config.json into the env-style names above. Unknown fields become warnings. */
function readConfigFile(file, warnings) {
	if (!fs.existsSync(file)) return {}
	let json
	try {
		json = JSON.parse(fs.readFileSync(file, 'utf8'))
	} catch (err) {
		throw new Error(`${path.basename(file)} is not valid JSON: ${err.message}`)
	}
	const out = {}
	for (const [key, value] of Object.entries(json)) {
		if (key.startsWith('_')) continue
		if (SETTINGS[key]) {
			out[SETTINGS[key]] = String(value)
		} else if (NESTED[key] && value && typeof value === 'object') {
			for (const [inner, innerValue] of Object.entries(value)) {
				if (inner.startsWith('_')) continue
				if (NESTED[key][inner]) out[NESTED[key][inner]] = String(innerValue)
				else warnings.push(`${path.basename(file)}: unknown field "${key}.${inner}" ignored`)
			}
		} else {
			warnings.push(`${path.basename(file)}: unknown field "${key}" ignored`)
		}
	}
	return out
}

/**
 * Secrets come from .env (or the process environment). Everything else comes from llm.config.json.
 * The process environment may still override non-secret settings, which is how the tests run.
 * Non-secret keys found in .env are ignored with a visible warning, never silently.
 */
export function loadConfig(env = process.env, root = DEMO_ROOT) {
	const warnings = []
	const fileSettings = readConfigFile(env.DEMO_CONFIG_FILE || path.join(root, 'llm.config.json'), warnings)

	let envFileVars = {}
	const envFile = path.join(root, '.env')
	if (env.DEMO_SKIP_ENV_FILE !== '1' && fs.existsSync(envFile)) {
		envFileVars = parseEnv(fs.readFileSync(envFile, 'utf8'))
		const stray = Object.keys(envFileVars).filter((k) => !SECRET_KEYS.includes(k))
		if (stray.length > 0) {
			warnings.push(`.env keys ignored (only ${SECRET_KEYS.join(', ')} is read from .env; set the rest in llm.config.json): ${stray.join(', ')}`)
		}
	}

	const merged = { ...DEFAULTS, ...fileSettings }
	for (const name of Object.values(SETTINGS).concat(...Object.values(NESTED).map((n) => Object.values(n)))) {
		if (env[name] !== undefined) merged[name] = env[name]
	}
	merged.LLM_API_KEY = env.LLM_API_KEY ?? envFileVars.LLM_API_KEY ?? ''

	const int = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d)
	const hasKey = merged.LLM_API_KEY !== '' && merged.LLM_API_KEY !== 'replace-me'
	return {
		mode: merged.LLM_MODE,
		provider: merged.LLM_PROVIDER,
		baseUrl: merged.LLM_BASE_URL.replace(/\/+$/, ''),
		model: merged.LLM_MODEL,
		apiKey: merged.LLM_API_KEY,
		hasKey,
		azureDeployment: merged.AZURE_DEPLOYMENT,
		azureApiVersion: merged.AZURE_API_VERSION,
		stripToolChoice: merged.LLM_STRIP_TOOL_CHOICE === 'true',
		anthropicThinking: merged.LLM_ANTHROPIC_THINKING,
		anthropicStrict: merged.LLM_ANTHROPIC_STRICT === 'true',
		anthropicBeta: merged.LLM_ANTHROPIC_BETA.trim(),
		timeoutMs: int(merged.LLM_TIMEOUT_MS, 90000),
		rateLimitPerMinute: int(merged.RATE_LIMIT_PER_MINUTE, 30),
		port: int(merged.PORT, 8787),
		logFile: path.resolve(root, merged.LOG_FILE),
		staticDir: path.join(root, 'dist', 'demo-app', 'browser'),
		warnings,
	}
}

/** Returns an error message, or null when the config is usable. Never includes the key. */
export function validateConfig(cfg) {
	if (cfg.mode !== 'mock' && cfg.mode !== 'live') return 'Invalid mode in llm.config.json (use mock or live)'
	if (cfg.mode === 'live') {
		if (cfg.provider === 'anthropic' && !['between_tools', 'omit'].includes(cfg.anthropicThinking)) {
			return 'Invalid anthropic.thinking in llm.config.json (use between_tools or omit)'
		}
		if (['openai', 'azure', 'anthropic'].includes(cfg.provider) && !cfg.hasKey) {
			return 'LLM_API_KEY is not set (put it in demo/.env)'
		}
		if (cfg.provider === 'azure' && !cfg.azureDeployment) {
			return 'azure.deployment is required in llm.config.json for provider azure'
		}
		if (!['openai', 'azure', 'generic', 'anthropic'].includes(cfg.provider)) return 'Invalid provider in llm.config.json (openai, azure, generic or anthropic)'
	}
	if (!fs.existsSync(path.join(cfg.staticDir, 'index.html'))) {
		return 'Build output missing. Run npm run build'
	}
	return null
}
