import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: 'tests',
	testMatch: 'live-tasks.spec.ts',
	workers: 1,
	timeout: 240000,
	reporter: [['list']],
	use: { baseURL: 'http://127.0.0.1:8798' },
	projects: [{ name: 'chromium', use: {
			...devices['Desktop Chrome'],
			viewport: { width: 1440, height: 900 },
			// Optional: point at an already installed Chromium when `playwright install` is blocked.
			launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
		} }],
	webServer: {
		command: 'node server/proxy.mjs',
		url: 'http://127.0.0.1:8798/api/health',
		reuseExistingServer: false,
		env: { PORT: '8798', LOG_FILE: 'logs/proxy-live-test.log' },
	},
})
