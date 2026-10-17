import type { PageAgentTool } from 'page-agent'
import * as z from 'zod/v4'

export type ChoiceMode = 'single' | 'multiple'

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

function labelOf(el: HTMLInputElement): string {
	const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null
	return byFor?.textContent ?? el.closest('label')?.textContent ?? el.getAttribute('aria-label') ?? el.value
}

/**
 * Decides single or multiple selection from the control that already shows these values.
 * A multi-select or a group of checkboxes means multiple, a plain select or radios means single.
 * Nothing matching, or a partial match, falls back to single.
 */
export function inferChoiceMode(options: string[]): ChoiceMode {
	const wanted = new Set(options.map(norm))
	const coversAll = (texts: string[]): boolean => {
		const have = new Set(texts.map(norm))
		return [...wanted].every((w) => have.has(w))
	}
	for (const sel of Array.from(document.querySelectorAll('select'))) {
		if (sel.closest('[data-page-agent-ignore]')) continue
		if (coversAll(Array.from(sel.options).map((o) => o.text))) return sel.multiple ? 'multiple' : 'single'
	}
	for (const type of ['checkbox', 'radio'] as const) {
		const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)).filter(
			(i) => !i.closest('[data-page-agent-ignore]')
		)
		if (inputs.length > 0 && coversAll(inputs.map(labelOf))) return type === 'checkbox' ? 'multiple' : 'single'
	}
	return 'single'
}

/** Shows the choice dialog. Resolves with the chosen values, or null when cancelled or aborted. */
export function showChoiceDialog(
	question: string,
	options: string[],
	mode: ChoiceMode,
	signal?: AbortSignal
): Promise<string[] | null> {
	return new Promise((resolve) => {
		const root = document.createElement('div')
		root.id = 'choice-dialog'
		root.className = 'choice-dialog'
		root.setAttribute('role', 'dialog')
		root.setAttribute('aria-modal', 'true')
		root.setAttribute('data-choice-mode', mode)
		root.setAttribute('data-page-agent-ignore', 'true')

		const box = document.createElement('div')
		box.className = 'choice-box'
		const q = document.createElement('p')
		q.className = 'choice-question'
		q.textContent = question
		box.append(q)

		let read: () => string[]
		if (mode === 'single') {
			const select = document.createElement('select')
			select.id = 'choice-select'
			select.setAttribute('aria-label', question)
			for (const o of options) select.add(new Option(o, o))
			box.append(select)
			read = () => [select.value]
		} else {
			const boxes: HTMLInputElement[] = []
			const list = document.createElement('div')
			list.className = 'choice-list'
			options.forEach((o, i) => {
				const label = document.createElement('label')
				const cb = document.createElement('input')
				cb.type = 'checkbox'
				cb.value = o
				cb.id = `choice-opt-${i}`
				boxes.push(cb)
				label.append(cb, ` ${o}`)
				list.append(label)
			})
			box.append(list)
			read = () => boxes.filter((b) => b.checked).map((b) => b.value)
		}

		const buttons = document.createElement('div')
		buttons.className = 'choice-buttons'
		const ok = document.createElement('button')
		ok.id = 'choice-ok'
		ok.type = 'button'
		ok.textContent = 'OK'
		const cancel = document.createElement('button')
		cancel.id = 'choice-cancel'
		cancel.type = 'button'
		cancel.textContent = 'Cancel'
		buttons.append(ok, cancel)
		box.append(buttons)
		root.append(box)

		const finish = (value: string[] | null): void => {
			signal?.removeEventListener('abort', onAbort)
			root.remove()
			resolve(value)
		}
		const onAbort = (): void => finish(null)
		ok.addEventListener('click', () => {
			const chosen = read()
			finish(chosen.length > 0 ? chosen : null)
		})
		cancel.addEventListener('click', () => finish(null))
		if (signal?.aborted) return resolve(null)
		signal?.addEventListener('abort', onAbort)

		document.body.append(root)
		;(root.querySelector('select, input') as HTMLElement | null)?.focus()
	})
}

export function createAskChoiceTool(
	tool: <T>(o: PageAgentTool<T>) => PageAgentTool<T>
): PageAgentTool<{ question: string; options: string[] }> {
	return tool({
		description:
			'Ask the user to pick from a fixed list of values that are visible on the page (dropdown options, radio buttons, checkboxes, table rows). Use this instead of ask_user whenever the answer is one of several known values. Pass the exact visible texts as options. The page decides whether one or several can be picked.',
		inputSchema: z.object({
			question: z.string().min(1),
			options: z.array(z.string().min(1)).min(2).max(30),
		}),
		execute: async function (input, { signal }) {
			const options = Array.from(new Set(input.options))
			const chosen = await showChoiceDialog(input.question, options, inferChoiceMode(options), signal)
			if (!chosen) return 'User did not choose a value. Do not guess one. Call done and say the choice was not made.'
			return `User chose: ${chosen.join(', ')}`
		},
	})
}
