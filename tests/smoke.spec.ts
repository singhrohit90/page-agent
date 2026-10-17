import fs from 'node:fs'
import path from 'node:path'

import { expect, request as pwRequest, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:8799'
const DEFAULTS_KEY = 'testfloor.defaults.workOrder'
const ROUTES = ['/dashboard', '/stations', '/results', '/measurements', '/work-orders', '/work-orders/new', '/settings']
const ALLOWED_LOG_KEYS = new Set([
	'ts', 'kind', 'status', 'durationMs', 'mode', 'provider', 'model', 'promptTokens', 'completionTokens',
	'totalTokens', 'upstreamStatus', 'session', 'taskId', 'stepIndex', 'action', 'gate', 'errorType',
	'toolCount', 'toolChoiceSent', 'thinkingSent', 'strict', 'maxTokens', 'messageCount', 'droppedFields',
])

async function runTask(page: import('@playwright/test').Page, task: string): Promise<void> {
	const input = page.locator('#page-agent-panel input')
	await expect(input).toBeVisible()
	await input.fill(task)
	await input.press('Enter')
}

test('S1 health', async ({ request }) => {
	const res = await request.get('/api/health')
	expect(res.status()).toBe(200)
	const json = await res.json()
	expect(json.mode).toBe('mock')
	expect(json.model).toBe('mock-scripted')
	expect(json.pageAgentVersion).toBe('1.12.4')
})

test('S2 shell', async ({ page }) => {
	await page.goto('/')
	await expect(page).toHaveURL(/\/dashboard$/)
	await expect(page.locator('nav a')).toHaveCount(6)
	await expect(page.locator('#llm-badge')).toHaveText('MOCK LLM - scripted replies, no AI model is called')
	await expect(page.locator('#page-agent-panel input')).toBeVisible()
	await expect(page.locator('#fpy-chart')).toHaveCount(1)
	await expect(page.locator('#run-status')).toHaveText('idle')
	await expect(page.locator('body')).not.toContainText('88.4')
})

test('S3 key never reaches the browser', async ({ page }) => {
	const bodies: string[] = []
	const badUrls: string[] = []
	const authHeaders: string[] = []
	page.on('request', async (req) => {
		if (!req.url().startsWith(BASE + '/')) badUrls.push(req.url())
		const headers = await req.allHeaders()
		if (headers['authorization']) authHeaders.push(req.url())
	})
	const pending: Promise<void>[] = []
	page.on('response', (res) => {
		pending.push(
			res
				.text()
				.then((t) => {
					bodies.push(t)
				})
				.catch(() => undefined)
		)
	})
	for (const route of ROUTES) {
		await page.goto(route)
		await expect(page.locator('h1')).toBeVisible()
	}
	await page.waitForTimeout(500)
	await Promise.all(pending)
	expect(bodies.length).toBeGreaterThan(10)
	expect(bodies.filter((b) => b.includes('sk-demo-canary'))).toHaveLength(0)
	expect(authHeaders).toEqual([])
	expect(badUrls).toEqual([])
})

test('S4 agent config', async ({ page }) => {
	await page.goto('/dashboard')
	await expect(page.locator('#page-agent-panel')).toBeVisible()
	const info = await page.evaluate(() => (window as unknown as { __demoAgentInfo: Record<string, unknown> }).__demoAgentInfo)
	expect(info.baseURL).toBe('/api/llm')
	expect(info.hasApiKey).toBe(false)
	expect(info.experimentalScriptExecutionTool).toBe(false)
	expect(info.tools).toContain('click_element_by_index')
	expect(info.tools).not.toContain('execute_javascript')
})

test('S5 proxy guards', async () => {
	const anon = await pwRequest.newContext({ baseURL: BASE })
	const noCookie = await anon.post('/api/llm/chat/completions', { data: {} })
	expect(noCookie.status()).toBe(401)

	const sess = await pwRequest.newContext({ baseURL: BASE })
	await sess.get('/')
	const forbidden = await sess.post('/api/llm/chat/completions', {
		data: {
			model: 'x',
			messages: [],
			tools: [{ type: 'function', function: { name: 'AgentOutput', description: 'execute_javascript' } }],
		},
	})
	expect(forbidden.status()).toBe(400)

	const big = await sess.post('/api/llm/chat/completions', {
		headers: { 'Content-Type': 'application/json' },
		data: JSON.stringify({ pad: 'x'.repeat(3 * 1024 * 1024) }),
	})
	expect(big.status()).toBe(413)
	await anon.dispose()
	await sess.dispose()
})

test('S6 not-interactive', async ({ page }) => {
	await page.goto('/settings')
	await expect(page.locator('#btn-reset-data')).toHaveAttribute('data-page-agent-not-interactive', /.*/)
	await expect(page.locator('#btn-delete-plant')).toHaveAttribute('data-page-agent-not-interactive', /.*/)
	await page.goto('/stations')
	const buttons = page.getByRole('button', { name: 'Decommission' })
	await expect(buttons).toHaveCount(24)
	const withAttr = await page.locator('button[data-page-agent-not-interactive]', { hasText: 'Decommission' }).count()
	expect(withAttr).toBe(24)
})

test('S7 write gate, deny', async ({ page }) => {
	const dialogs: string[] = []
	page.on('dialog', (d) => {
		dialogs.push(d.message())
		void d.dismiss()
	})
	await page.goto('/dashboard')
	await runTask(page, 'mock: submit the work order form')
	await expect(page.locator('#page-agent-panel')).toContainText('BLOCKED by user', { timeout: 60000 })
	expect(dialogs.length).toBe(1)
	expect(dialogs[0]).toContain('"Create work order"')
	await expect(page.locator('#run-denied')).toHaveText('1')
	await page.goto('/work-orders')
	await expect(page.locator('#work-orders-table tbody tr')).toHaveCount(3)
})

test('S8 write gate, approve', async ({ page }) => {
	const dialogs: string[] = []
	page.on('dialog', (d) => {
		dialogs.push(d.message())
		void d.accept()
	})
	await page.goto('/dashboard')
	await page.evaluate(() => localStorage.clear())
	await runTask(page, 'mock: submit the work order form')
	await expect(page.locator('#run-approved')).toHaveText('1', { timeout: 60000 })
	await expect(page.locator('#run-refused')).toHaveText('0')
	expect(dialogs.length).toBe(1)
	await expect(page.locator('#work-orders-table tbody tr')).toHaveCount(4)
})

test('S12 complete mock script creates a work order after the confirm dialog', async ({ page }) => {
	const dialogs: string[] = []
	page.on('dialog', (d) => {
		dialogs.push(d.message())
		void d.accept()
	})
	await page.goto('/dashboard')
	await page.evaluate(() => localStorage.clear())
	await runTask(page, 'mock: submit the work order form')
	await expect(page.getByText('Work order WO-1043 created')).toBeVisible({ timeout: 60000 })
	expect(dialogs).toHaveLength(1)
	const top = page.locator('#work-orders-table tbody tr').first()
	await expect(top).toContainText('WO-1043')
	await expect(top).toContainText('Mock work order')
	await expect(top).toContainText('ST-L1-ICT-02')
	await expect(top).toContainText('High')
	await expect(top).toContainText('Calibration')
	await expect(top).toContainText('2026-10-24')
	await expect(top).toContainText('Priya Nair')
	await expect(page.locator('#run-approved')).toHaveText('1')
	await expect(page.locator('#run-denied')).toHaveText('0')
})

test('S13 incomplete script: NEEDS_INPUT, ask_user answered in the panel, no work order', async ({ page }) => {
	const dialogs: string[] = []
	page.on('dialog', (d) => {
		dialogs.push(d.message())
		void d.dismiss()
	})
	await page.goto('/dashboard')
	await page.evaluate(() => localStorage.clear())
	await runTask(page, 'mock: submit incomplete work order')

	const question = page.locator('#page-agent-panel [data-temp-card="true"]')
	await expect(question).toBeVisible({ timeout: 60000 })
	for (const field of ['Station', 'Type', 'Due date', 'Assignee', 'Description']) {
		await expect(question).toContainText(field)
	}
	await expect(question).not.toContainText('Title')
	// The guard refused before any dialog and counted it separately from denials.
	await expect(page.locator('#run-refused')).toHaveText('1')
	await expect(page.locator('#run-denied')).toHaveText('0')
	await expect(page.locator('#run-approved')).toHaveText('0')
	await expect(page.locator('#run-status')).toHaveText('running')
	expect(dialogs).toEqual([])

	// Answer the way a user would: type into the panel input and press Enter.
	const input = page.locator('#page-agent-panel input')
	await expect(input).toBeVisible()
	await input.fill('ST-L1-ICT-02, Calibration, 2026-10-24, Priya Nair, recalibrate the fixture')
	await input.press('Enter')

	await expect(page.locator('#page-agent-panel')).toContainText('No work order was created', { timeout: 60000 })
	await expect(page.locator('#run-status')).not.toHaveText('running', { timeout: 30000 })
	expect(dialogs).toEqual([])
	await page.goto('/work-orders')
	await expect(page.locator('#work-orders-table tbody tr')).toHaveCount(3)
})

test('S16 ask_choice: single choice, mode taken from the matching select', async ({ page }) => {
	await page.goto('/stations')
	await runTask(page, 'mock: ask choice line')
	const dialog = page.locator('#choice-dialog')
	await expect(dialog).toBeVisible({ timeout: 60000 })
	await expect(dialog).toContainText('Which line do you mean?')
	await expect(dialog).toHaveAttribute('data-choice-mode', 'single')
	await dialog.locator('#choice-select').selectOption({ label: 'L2' })
	await dialog.locator('#choice-ok').click()
	await expect(page.locator('#page-agent-panel')).toContainText('User chose: L2', { timeout: 60000 })
	await expect(dialog).toHaveCount(0)
})

test('S17 ask_choice: multiple choice when the page control is a multi-select', async ({ page }) => {
	await page.goto('/stations')
	await page.evaluate(() => {
		const s = document.createElement('select')
		s.multiple = true
		s.id = 'test-multi'
		for (const t of ['Alpha', 'Beta', 'Gamma']) s.add(new Option(t))
		document.querySelector('h1')?.after(s)
	})
	await runTask(page, 'mock: ask choice multi')
	const dialog = page.locator('#choice-dialog')
	await expect(dialog).toBeVisible({ timeout: 60000 })
	await expect(dialog).toHaveAttribute('data-choice-mode', 'multiple')
	await dialog.getByLabel('Alpha').check()
	await dialog.getByLabel('Gamma').check()
	await dialog.locator('#choice-ok').click()
	await expect(page.locator('#page-agent-panel')).toContainText('User chose: Alpha, Gamma', { timeout: 60000 })
})

test('S18 ask_choice: no matching control means single, cancel returns no value', async ({ page }) => {
	await page.goto('/stations')
	await runTask(page, 'mock: ask choice none')
	const dialog = page.locator('#choice-dialog')
	await expect(dialog).toBeVisible({ timeout: 60000 })
	await expect(dialog).toHaveAttribute('data-choice-mode', 'single')
	await dialog.locator('#choice-cancel').click()
	await expect(page.locator('#page-agent-panel')).toContainText('did not choose', { timeout: 60000 })
})

test('S14 confirm dialog shows the values about to be submitted', async ({ page }) => {
	const dialogs: string[] = []
	page.on('dialog', (d) => {
		dialogs.push(d.message())
		void d.dismiss()
	})
	await page.goto('/dashboard')
	await page.evaluate(() => localStorage.clear())
	await runTask(page, 'mock: submit the work order form')
	await expect(page.locator('#run-denied')).toHaveText('1', { timeout: 60000 })
	expect(dialogs).toHaveLength(1)
	expect(dialogs[0]).toContain('"Create work order"')
	for (const line of ['Title: Mock work order', 'Station: ST-L1-ICT-02', 'Priority: High', 'Due date: 2026-10-24']) {
		expect(dialogs[0]).toContain(line)
	}
})

test('S15 remembered defaults: stored, offered to the model, cleared by a human only', async ({ page }) => {
	page.on('dialog', (d) => void d.accept())
	await page.goto('/dashboard')
	await page.evaluate(() => localStorage.clear())
	await runTask(page, 'mock: submit the work order form')
	await expect(page.getByText('Work order WO-1043 created')).toBeVisible({ timeout: 60000 })

	// Only select-type choices are stored.
	const stored = await page.evaluate((k) => localStorage.getItem(k), DEFAULTS_KEY)
	expect(JSON.parse(stored ?? 'null')).toEqual({ priority: 'High', type: 'Calibration', assignee: 'Priya Nair' })
	expect(stored).not.toContain('Mock work order')
	expect(stored).not.toContain('golden board')

	await page.goto('/settings')
	await expect(page.locator('#remembered-defaults-list')).toContainText('Priority: High')
	await expect(page.locator('#remembered-defaults-list')).toContainText('Type: Calibration')
	await expect(page.locator('#remembered-defaults-list')).toContainText('Assignee: Priya Nair')
	await expect(page.locator('#btn-clear-defaults')).toHaveAttribute('data-page-agent-not-interactive', /.*/)
	await expect(page.locator('#remembered-defaults')).toHaveAttribute('data-page-agent-not-interactive', /.*/)

	// The defaults reach the model through the page instructions of /work-orders/new.
	await page.getByRole('link', { name: 'Work orders' }).click()
	await page.getByRole('link', { name: 'New work order' }).click()
	await expect(page).toHaveURL(/\/work-orders\/new$/)
	const requestBodies: string[] = []
	page.on('request', (req) => {
		if (req.url().endsWith('/api/llm/chat/completions')) requestBodies.push(req.postData() ?? '')
	})
	await runTask(page, 'Show me all offline FCT stations on line L2.')
	await expect(page.locator('#page-agent-panel')).toContainText('MOCK MODE: no AI model was called.', { timeout: 60000 })
	expect(requestBodies.length).toBeGreaterThan(0)
	expect(requestBodies[0]).toContain(
		"Remembered defaults from this user's last work order: priority=High, type=Calibration, assignee=Priya Nair. Use them only for fields the user did not specify, and say in your done text which defaults you used."
	)

	// A human clears them from Settings.
	await page.goto('/settings')
	await page.locator('#btn-clear-defaults').click()
	await expect(page.locator('#remembered-defaults-empty')).toBeVisible()
	expect(await page.evaluate((k) => localStorage.getItem(k), DEFAULTS_KEY)).toBeNull()

	// "Reset all demo data" clears them too.
	await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ priority: 'Low' })), DEFAULTS_KEY)
	await page.reload()
	await expect(page.locator('#remembered-defaults-list')).toContainText('Priority: Low')
	await page.locator('#btn-reset-data').click()
	await page.waitForLoadState('load')
	await expect(page.locator('#remembered-defaults-empty')).toBeVisible()
	expect(await page.evaluate((k) => localStorage.getItem(k), DEFAULTS_KEY)).toBeNull()
})

test('S10 mock default reply', async ({ page }) => {
	await page.goto('/dashboard')
	await runTask(page, 'Show me all offline FCT stations on line L2.')
	await expect(page.locator('#page-agent-panel')).toContainText('MOCK MODE: no AI model was called.', { timeout: 60000 })
})

test('S11 data check', async ({ page }) => {
	await page.goto('/dashboard')
	const check = await page.evaluate(() => (window as unknown as { __demoDataCheck: Record<string, unknown> }).__demoDataCheck)
	expect(check.stationsCount).toBe(24)
	expect(check.offlineFctL2).toEqual(['ST-L2-FCT-03', 'ST-L2-FCT-05'])
	expect(check.station10Calibration).toBe('2026-09-15')
	expect(check.resultsCount).toBe(60)
	expect(check.failResultsCount).toBe(13)
	expect(check.topFailByCycle).toBe('SN-24A0117')
	expect(check.l3Eol01Codes).toEqual(['E-221'])
	expect(check.measurementsCount).toBe(10000)
	expect(check.measurementFailCount).toBe(453)
	expect(check.m00001Value).toBe('19.19')
	expect(check.m00037Value).toBe('10.03')
	expect(check.lowestYieldDate).toBe('2026-10-13')
	expect(check.lowestYieldValue).toBe(88.4)
})

// Runs last on purpose: it inspects the log written by the tests above.
test('S9 log hygiene', async () => {
	const file = path.resolve(process.cwd(), 'logs', 'proxy-test.log')
	await expect.poll(() => fs.existsSync(file), { timeout: 10000 }).toBe(true)
	const text = fs.readFileSync(file, 'utf8')
	const lines = text.split('\n').filter((l) => l.trim().length > 0)
	expect(lines.length).toBeGreaterThan(0)
	const kinds = new Set<string>()
	for (const line of lines) {
		const obj = JSON.parse(line) as Record<string, unknown>
		for (const key of Object.keys(obj)) expect(ALLOWED_LOG_KEYS.has(key), `unexpected key ${key}`).toBe(true)
		kinds.add(String(obj.kind))
		for (const banned of ['Mock work order', '<browser_state>', 'sk-demo-canary', 'user_request']) {
			expect(line.includes(banned), `log line contains ${banned}`).toBe(false)
		}
	}
	expect(kinds.has('llm')).toBe(true)
	expect(kinds.has('audit')).toBe(true)
})
