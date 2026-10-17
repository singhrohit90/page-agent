import fs from 'node:fs'
import path from 'node:path'

export default function globalSetup(): void {
	const file = path.resolve(process.cwd(), 'logs', 'proxy-test.log')
	if (fs.existsSync(file)) fs.rmSync(file)
}
