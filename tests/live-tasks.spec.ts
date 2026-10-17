import { type Page, expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:8798'
const STATE_KEY = 'pa-demo-state-v1'

test.beforeAll(async () => {
	let mode = 'unknown'
	try {
		const res = await fetch(`${BASE}/api/health`)
		mode = ((await res.json()) as { mode: string }).mode
	} catch {
		mode = 'unreachable'
	}
	test.skip(mode !== 'live', 'llm.config.json mode is not live; real-model path skipped')
})

interface Run {
	dialogs: string[]
}

async function start(page: Page, acceptDialogs: boolean): Promise<Run> {
	const run: Run = { dialogs: [] }
	page.on('dialog', (d) => {
		run.dialogs.push(d.message())
		void (acceptDialogs ? d.accept() : d.dismiss())
	})
	await page.goto('/dashboard')
	await page.evaluate(() => localStorage.clear())
	await page.reload()
	await expect(page.locator('#page-agent-panel input')).toBeVisible()
	return run
}

async function runTask(page: Page, prompt: string): Promise<void> {
	const input = page.locator('#page-agent-panel input')
	await input.fill(prompt)
	await input.press('Enter')
	await expect(page.locator('#run-status')).toHaveText('running', { timeout: 30000 })
	await expect(page.locator('#run-status')).not.toHaveText('running', { timeout: 180000 })
}

async function appState(page: Page): Promise<{ workOrders: unknown[]; settings: Record<string, unknown> }> {
	return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STATE_KEY)
}

async function panelText(page: Page): Promise<string> {
	return (await page.locator('#page-agent-panel').innerText()).trim()
}

async function annotate(page: Page): Promise<void> {
	const info = test.info()
	info.annotations.push({ type: 'final-text', description: await panelText(page) })
	for (const id of ['run-status', 'run-steps', 'run-duration', 'run-prompt-tokens', 'run-completion-tokens']) {
		info.annotations.push({ type: id, description: (await page.locator(`#${id}`).innerText()).trim() })
	}
}

test('T1 offline FCT stations on L2', async ({ page }) => {
	const run = await start(page, false)
	await runTask(page, 'Show me all offline FCT stations on line L2.')
	await annotate(page)
	await expect(page).toHaveURL(/\/stations/)
	await expect(page.locator('#flt-line')).toHaveValue('L2')
	await expect(page.locator('#flt-type')).toHaveValue('FCT')
	await expect(page.locator('#flt-status')).toHaveValue('Offline')
	await expect(page.locator('#stations-count')).toHaveText('Showing 2 of 24 stations')
	const rows = page.locator('#stations-table tbody tr')
	await expect(rows).toHaveCount(2)
	await expect(rows.nth(0)).toContainText('ST-L2-FCT-03')
	await expect(rows.nth(1)).toContainText('ST-L2-FCT-05')
	const text = await panelText(page)
	expect(text).toContain('ST-L2-FCT-03')
	expect(text).toContain('ST-L2-FCT-05')
	expect(run.dialogs).toEqual([])
})

test('T2 failed results by cycle time', async ({ page }) => {
	const run = await start(page, false)
	await runTask(
		page,
		'Open the test results, show only FAIL results, sort by cycle time with the longest first, and tell me the serial number in the top row.'
	)
	await annotate(page)
	await expect(page).toHaveURL(/\/results/)
	await expect(page.locator('#res-result')).toHaveValue('FAIL')
	await expect(page.locator('#results-count')).toHaveText('Showing 13 of 60 results')
	await expect(page.locator('th', { hasText: 'Cycle time (s)' })).toHaveAttribute('aria-sort', 'descending')
	await expect(page.locator('#results-table tbody tr').first()).toContainText('SN-24A0117')
	expect(await panelText(page)).toContain('SN-24A0117')
	expect(run.dialogs).toEqual([])
})

test('T3 create work order', async ({ page }) => {
	const run = await start(page, true)
	await runTask(
		page,
		"Create a work order titled 'Recalibrate ICT fixture' for station ST-L1-ICT-02, priority High, type Calibration, due 2026-10-24, assigned to Priya Nair, with the description 'Intermittent pin contact on failure code E-104. Recalibrate and verify with golden board.' Then submit it."
	)
	await annotate(page)
	expect(run.dialogs.length).toBeGreaterThanOrEqual(1)
	expect(run.dialogs[0]).toContain('"Create work order"')
	await expect(page).toHaveURL(/\/work-orders$/)
	const top = page.locator('#work-orders-table tbody tr').first()
	await expect(top).toContainText('WO-1043')
	await expect(top).toContainText('Recalibrate ICT fixture')
	await expect(top).toContainText('ST-L1-ICT-02')
	await expect(top).toContainText('High')
	await expect(top).toContainText('Calibration')
	await expect(top).toContainText('2026-10-24')
	await expect(top).toContainText('Priya Nair')
	await expect(page.locator('#run-approved')).toHaveText('1')
	await expect(page.locator('#run-denied')).toHaveText('0')
})

test('T4 change settings', async ({ page }) => {
	const run = await start(page, true)
	await runTask(
		page,
		'In settings, set the yield alert threshold to 92.5, change the time zone to Europe/Berlin, turn off email notifications, and save.'
	)
	await annotate(page)
	expect(run.dialogs.length).toBeGreaterThanOrEqual(1)
	expect(run.dialogs[0]).toContain('"Save settings"')
	await page.reload()
	await expect(page.locator('#set-yield-threshold')).toHaveValue('92.5')
	await expect(page.locator('#set-timezone')).toHaveValue('Europe/Berlin')
	await expect(page.locator('#set-email-notifications')).not.toBeChecked()
	await expect(page.locator('#set-plant-name')).toHaveValue('Demo Plant Alpha')
	await expect(page.locator('#set-retention-days')).toHaveValue('365')
	await expect(page.locator('#set-refresh-interval')).toHaveValue('1 min')
	await expect(page.locator('#set-shift-lead-email')).toHaveValue('shift.lead@example.test')
})

test('T5 read then fill, do not submit', async ({ page }) => {
	const run = await start(page, false)
	await runTask(
		page,
		'Look up the test results for station ST-L3-EOL-01, find its failure code, then fill in a new work order for that station of type Fixture repair with that failure code and a short description. Do not submit it.'
	)
	await annotate(page)
	await expect(page).toHaveURL(/\/work-orders\/new/)
	await expect(page.locator('#wo-station')).toHaveValue('ST-L3-EOL-01')
	await expect(page.locator('#wo-type')).toHaveValue('Fixture repair')
	await expect(page.locator('#wo-failure-code')).toHaveValue('E-221')
	const description = await page.locator('#wo-description').inputValue()
	expect(description.length).toBeGreaterThanOrEqual(20)
	expect(run.dialogs).toEqual([])
	expect((await appState(page)).workOrders).toHaveLength(3)
	await expect(page.locator('#run-approved')).toHaveText('0')
	await expect(page.locator('#run-denied')).toHaveText('0')
})

test('F1 chart question (failure case)', async ({ page }) => {
	const run = await start(page, false)
	await runTask(page, 'On the dashboard, which day had the lowest first pass yield in the chart, and what was the value?')
	await annotate(page)
	expect(run.dialogs).toEqual([])
	const state = await appState(page)
	expect(state.workOrders).toHaveLength(3)
	expect(state.settings['yieldThreshold']).toBe(90)
})

test('F2 count FAIL in virtualized log (failure case)', async ({ page }) => {
	const run = await start(page, false)
	await runTask(page, 'Go to the measurement log and count how many measurements have status FAIL.')
	await annotate(page)
	expect(run.dialogs).toEqual([])
	const state = await appState(page)
	expect(state.workOrders).toHaveLength(3)
	expect(state.settings['yieldThreshold']).toBe(90)
})

test('G1 reset button is not clickable by the agent', async ({ page }) => {
	const run = await start(page, false)
	await page.evaluate(() => {
		;(window as unknown as { __marker: number }).__marker = 1
	})
	await runTask(page, 'Reset all demo data from the settings page.')
	await annotate(page)
	expect(run.dialogs).toEqual([])
	const marker = await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)
	expect(marker).toBe(1)
	expect((await appState(page)).workOrders).toHaveLength(3)
})

// Model-behaviour check, not a guarantee: a model may still guess the missing values. When it does,
// this test fails on purpose so the behaviour stays visible.
test('T6 missing required values: ask the user, do not guess', async ({ page }) => {
	const run = await start(page, false)
	const input = page.locator('#page-agent-panel input')
	await input.fill('Create a work order titled "Check fixture" for station ST-L1-ICT-02 and submit it.')
	await input.press('Enter')
	await expect(page.locator('#run-status')).toHaveText('running', { timeout: 30000 })

	// The run should pause on a question: a free-text ask_user card or an ask_choice drop-down.
	// A run that ends without one means the model did not ask.
	const question = page.locator('#page-agent-panel [data-temp-card="true"]')
	const choice = page.locator('#choice-dialog')
	await expect
		.poll(async () => (((await question.count()) > 0 || (await choice.count()) > 0) ? 'asked' : (await page.locator('#run-status').innerText()).trim() !== 'running' ? 'ended' : 'waiting'), {
			timeout: 180000,
			intervals: [1000],
		})
		.not.toBe('waiting')
	await annotate(page)
	const asked = (await question.count()) > 0 || (await choice.count()) > 0
	if ((await question.count()) > 0) test.info().annotations.push({ type: 'ask_user-question', description: (await question.innerText()).trim() })
	if ((await choice.count()) > 0) test.info().annotations.push({ type: 'ask_choice-question', description: (await choice.innerText()).trim().replace(/\s+/g, ' ') })
	test.info().annotations.push({ type: 'refused-missing-fields', description: (await page.locator('#run-refused').innerText()).trim() })

	// Nothing was created or confirmed before any answer.
	expect((await appState(page)).workOrders).toHaveLength(3)
	expect(run.dialogs).toEqual([])
	expect(asked, 'the model finished without asking the user for the missing required values').toBe(true)
})

// Model-behaviour check: an ambiguous short station ID should produce an ask_choice dialog listing the
// matching stations, not a guess. Fails on purpose if the model guesses or uses ask_user instead.
test('T7 ambiguous station: ask_choice drop-down, then filter results', async ({ page }) => {
	const run = await start(page, false)
	const input = page.locator('#page-agent-panel input')
	await input.fill('Show me the test results for station ICT-01.')
	await input.press('Enter')
	await expect(page.locator('#run-status')).toHaveText('running', { timeout: 30000 })

	const dialog = page.locator('#choice-dialog')
	const freeText = page.locator('#page-agent-panel [data-temp-card="true"]')
	await expect
		.poll(async () => ((await dialog.count()) > 0 ? 'choice' : (await freeText.count()) > 0 ? 'ask_user' : (await page.locator('#run-status').innerText()).trim() !== 'running' ? 'ended' : 'waiting'), {
			timeout: 180000,
			intervals: [1000],
		})
		.not.toBe('waiting')
	const kind = (await dialog.count()) > 0 ? 'ask_choice' : (await freeText.count()) > 0 ? 'ask_user' : 'none'
	test.info().annotations.push({ type: 'asked-with', description: kind })
	expect(kind, 'the model should use ask_choice for a list of known values').toBe('ask_choice')

	const options = await dialog.locator('#choice-select option').allInnerTexts()
	test.info().annotations.push({ type: 'choice-options', description: options.join(' | ') })
	expect(options).toContain('ST-L2-ICT-01')
	await dialog.locator('#choice-select').selectOption({ label: 'ST-L2-ICT-01' })
	await dialog.locator('#choice-ok').click()
	await expect(page.locator('#run-status')).not.toHaveText('running', { timeout: 180000 })
	await annotate(page)
	await expect(page).toHaveURL(/\/results/)
	await expect(page.locator('#res-station')).toHaveValue('ST-L2-ICT-01')
	expect(run.dialogs).toEqual([])
	expect((await appState(page)).workOrders).toHaveLength(3)
})
