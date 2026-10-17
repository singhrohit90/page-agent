import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function tooOld(version, min) {
	const a = version.split('.').map(Number)
	const b = min.split('.').map(Number)
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) > b[i]) return false
		if ((a[i] ?? 0) < b[i]) return true
	}
	return false
}

if (tooOld(process.versions.node, '24.15.0')) {
	console.error('Node 24.15.0 or newer is required. Install Node 24 LTS: winget install OpenJS.NodeJS.LTS')
	process.exit(1)
}

if (!fs.existsSync(path.join(root, 'node_modules', 'page-agent', 'package.json'))) {
	const r = spawnSync('npm', ['ci'], { stdio: 'inherit', shell: true, cwd: root })
	if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!fs.existsSync(path.join(root, '.env'))) {
	console.log('No demo/.env found. For a real model: copy .env.example to .env (key only) and set "mode": "live" in llm.config.json.')
}
