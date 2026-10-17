/**
 * Scripted mock LLM. No model is called. It exists to run the full
 * browser -> proxy -> page-agent loop and the safety gate without any key.
 */
let counter = 0

const ELEMENT_LINE = /^\s*\*?\[(\d+)\]<([a-z]+)([^>]*)>(.*)$/

function lastUserContent(messages) {
	if (!Array.isArray(messages)) return ''
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]
		if (m?.role === 'user') {
			if (typeof m.content === 'string') return m.content
			if (Array.isArray(m.content)) return m.content.map((p) => p?.text ?? '').join('\n')
		}
	}
	return ''
}

function parsePrompt(content) {
	const taskMatch = content.match(/<user_request>([\s\S]*?)<\/user_request>/)
	const task = (taskMatch ? taskMatch[1] : '').trim().toLowerCase()
	const stepCount = (content.match(/<step_\d+>/g) ?? []).length
	let lastResult = ''
	for (const line of content.split('\n')) {
		if (line.startsWith('Action Results: ')) lastResult = line.slice('Action Results: '.length)
	}
	const browserIdx = content.indexOf('<browser_state>')
	const pageText = browserIdx >= 0 ? content.slice(browserIdx) : content
	const elements = []
	for (const line of pageText.split('\n')) {
		const m = line.match(ELEMENT_LINE)
		if (m) elements.push({ index: Number(m[1]), tag: m[2], attrs: m[3], text: m[4] })
	}
	return { task, stepCount, lastResult, elements, pageChars: pageText.length }
}

function findEl(elements, pred) {
	return elements.find(pred)
}

function planStep(p) {
	const { task, stepCount, elements } = p
	const click = (el, goal) => ({ goal, action: { click_element_by_index: { index: el.index } } })
	const fail = (what) => ({
		goal: 'MOCK: finish',
		action: { done: { success: false, text: `MOCK: could not find ${what} on this page.` } },
	})
	const byId = (id) => findEl(elements, (e) => e.attrs.includes(`id=${id}`))
	const link = (text) => findEl(elements, (e) => e.tag === 'a' && e.text.includes(text))
	const typeInto = (id, label, text) => {
		const el = byId(id)
		return el ? { goal: `MOCK: type the ${label}`, action: { input_text: { index: el.index, text } } } : fail(`the ${label} field`)
	}
	const pick = (id, label, text) => {
		const el = byId(id)
		return el
			? { goal: `MOCK: choose the ${label}`, action: { select_dropdown_option: { index: el.index, text } } }
			: fail(`the ${label} dropdown`)
	}
	const openWorkOrders = () => {
		const el = link('Work orders')
		return el ? click(el, 'MOCK: open Work orders') : fail('the Work orders link')
	}
	const openNewWorkOrder = () => {
		const el = link('New work order')
		return el ? click(el, 'MOCK: open New work order') : fail('the New work order link')
	}
	const clickCreate = () => {
		const el = findEl(elements, (e) => e.tag === 'button' && e.text.includes('Create work order'))
		return el ? click(el, 'MOCK: click Create work order') : fail('the Create work order button')
	}
	const finish = (success, text) => ({ goal: 'MOCK: finish', action: { done: { success, text } } })

	if (task === 'mock: go to work orders') {
		if (stepCount === 0) return openWorkOrders()
		return finish(true, 'MOCK: navigated to Work orders.')
	}

	// Fills every required field with fake values that exist in the data, then submits.
	if (task === 'mock: submit the work order form') {
		const steps = [
			openWorkOrders,
			openNewWorkOrder,
			() => typeInto('wo-title', 'Title', 'Mock work order'),
			() => pick('wo-station', 'Station', 'ST-L1-ICT-02'),
			() => pick('wo-type', 'Type', 'Calibration'),
			() => typeInto('wo-due', 'Due date', '2026-10-24'),
			() => pick('wo-assignee', 'Assignee', 'Priya Nair'),
			() => typeInto('wo-description', 'Description', 'Mock description: recalibrate the fixture and verify with the golden board.'),
			() => {
				const el = byId('wo-priority-high')
				return el ? click(el, 'MOCK: set priority High') : fail('the High priority option')
			},
			clickCreate,
		]
		if (stepCount < steps.length) return steps[stepCount]()
		return finish(true, `MOCK: last action result: ${p.lastResult}`)
	}

	// Fills only the title, so the guard answers NEEDS_INPUT and the script must ask the user.
	if (task === 'mock: submit incomplete work order') {
		const steps = [openWorkOrders, openNewWorkOrder, () => typeInto('wo-title', 'Title', 'Incomplete mock order'), clickCreate]
		if (stepCount < steps.length) return steps[stepCount]()
		if (stepCount === steps.length) {
			const m = p.lastResult.match(/^NEEDS_INPUT: required fields are empty or invalid: (.*?)\. Ask the user/)
			if (!m) return finish(false, `MOCK: expected a NEEDS_INPUT result but got: ${p.lastResult}`)
			return {
				goal: 'MOCK: ask the user for the missing values',
				action: { ask_user: { question: `MOCK: I cannot submit yet. Please give me values for: ${m[1]}.` } },
			}
		}
		return finish(true, `MOCK: the user answered (${p.lastResult}). No work order was created.`)
	}

	// Asks with a list of values; the app decides single or multiple from the matching control on the page.
	const choiceScripts = {
		'mock: ask choice line': ['Which line do you mean?', ['L1', 'L2', 'L3', 'L4']],
		'mock: ask choice multi': ['Which parts do you want?', ['Alpha', 'Beta', 'Gamma']],
		'mock: ask choice none': ['Which one do you mean?', ['ST-L1-ICT-01', 'ST-L2-ICT-01']],
	}
	if (choiceScripts[task]) {
		if (stepCount === 0) {
			const [question, options] = choiceScripts[task]
			return { goal: 'MOCK: ask the user to choose', action: { ask_choice: { question, options } } }
		}
		return finish(true, `MOCK: last action result: ${p.lastResult}`)
	}

	return {
		goal: 'MOCK: finish',
		action: {
			done: {
				success: false,
				text: `MOCK MODE: no AI model was called. The browser -> proxy -> page-agent loop works. Page text sent: ${p.pageChars} characters, ${elements.length} indexed elements. Set mode to live in llm.config.json and put LLM_API_KEY in .env to use a real model.`,
			},
		},
	}
}

export async function mockCompletion(body) {
	const content = lastUserContent(body?.messages)
	const plan = planStep(parsePrompt(content))
	await new Promise((r) => setTimeout(r, 600))

	counter += 1
	const args = {
		evaluation_previous_goal: 'MOCK: scripted step',
		memory: 'MOCK: no model is called',
		next_goal: plan.goal,
		action: plan.action,
	}
	const promptTokens = Math.ceil(content.length / 4)
	return {
		id: `mock-${counter}`,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		model: 'mock-scripted',
		choices: [
			{
				index: 0,
				finish_reason: 'tool_calls',
				message: {
					role: 'assistant',
					content: null,
					tool_calls: [
						{
							id: `call_mock_${counter}`,
							type: 'function',
							function: { name: 'AgentOutput', arguments: JSON.stringify(args) },
						},
					],
				},
			},
		],
		usage: { prompt_tokens: promptTokens, completion_tokens: 40, total_tokens: promptTokens + 40 },
	}
}
