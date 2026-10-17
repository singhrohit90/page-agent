import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: 'tests',
	testMatch: 'smoke.spec.ts',
	workers: 1,
	timeout: 90000,
	reporter: [['list']],
	globalSetup: './tests/global-setup.ts',
	use: { baseURL: 'http://127.0.0.1:8799' },
	projects: [{ name: 'chromium', use: {
			...devices['Desktop Chrome'],
			viewport: { width: 1440, height: 900 },
			// Optional: point at an already installed Chromium when `playwright install` is blocked.
			launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
		} }],
	webServer: {
		command: 'node server/proxy.mjs',
		url: 'http://127.0.0.1:8799/api/health',
		reuseExistingServer: false,
		env: {
			PORT: '8799',
			LLM_MODE: 'mock',
			DEMO_SKIP_ENV_FILE: '1',
			LLM_API_KEY: 'sk-demo-canary-0000000000',
			LOG_FILE: 'logs/proxy-test.log',
		},
	},
})
