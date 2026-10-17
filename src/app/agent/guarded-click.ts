import type { PageAgentCore, PageAgentTool } from 'page-agent'
import * as z from 'zod/v4'

export type Gate = 'approved' | 'denied' | 'blocked-unresolved' | 'refused-missing-fields'

type FormControlEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/**
 * Replaces the built-in click_element_by_index (same name, description and schema).
 * Any element inside a [data-agent-write] container needs a human OK via window.confirm().
 * A write button that submits a form with empty or invalid fields is refused before any dialog.
 * Fails closed: if the element cannot be resolved, nothing is clicked.
 */
export function createGuardedClickTool(
	tool: <T>(o: PageAgentTool<T>) => PageAgentTool<T>,
	onGate: (g: Gate) => void
): PageAgentTool<{ index: number }> {
	return tool({
		description: 'Click element by index',
		inputSchema: z.object({ index: z.int().min(0) }),
		execute: async function (this: PageAgentCore, input) {
			const el = resolveIndexedElement(this.pageController, input.index)
			if (!el) {
				onGate('blocked-unresolved')
				return `BLOCKED: the safety guard could not resolve element ${input.index}. Refusing to click.`
			}
			const writeEl = el.closest('[data-agent-write]')
			if (writeEl) {
				const label = writeEl.getAttribute('data-agent-write') ?? 'write action'
				const form = submittedForm(el)
				if (form) {
					const missing = invalidFieldLabels(form)
					if (missing.length > 0) {
						onGate('refused-missing-fields')
						return `NEEDS_INPUT: required fields are empty or invalid: ${missing.join(', ')}. Ask the user for these values with the ask_user action. Do not guess them and do not retry the click until they are filled.`
					}
				}
				const summary = form ? `\n\nValues about to be submitted:\n${formSummary(form)}` : ''
				const ok = window.confirm(
					`page-agent wants to perform a write action:\n\n"${label}"${summary}\n\nClick OK to allow or Cancel to block.`
				)
				onGate(ok ? 'approved' : 'denied')
				if (!ok) {
					return `BLOCKED by user: the write action "${label}" was not confirmed. Do not retry it. Call done and tell the user the action was cancelled.`
				}
			}
			const result = await this.pageController.clickElement(input.index)
			return result.message
		},
	})
}

function resolveIndexedElement(pc: unknown, index: number): HTMLElement | null {
	// page-agent 1.12.4 keeps the index map in the TS-private field `selectorMap`
	// (packages/page-controller/src/PageController.ts). Pinned version; fail closed if it changes.
	const map = (pc as { selectorMap?: unknown }).selectorMap
	if (!(map instanceof Map)) return null
	const node = map.get(index) as { ref?: unknown } | undefined
	return node?.ref instanceof HTMLElement ? node.ref : null
}

/** The form a click would submit, or null when the element is not a submit control. */
function submittedForm(el: HTMLElement): HTMLFormElement | null {
	const control = el.closest('button, input')
	if (!control) return null
	const isSubmit =
		control instanceof HTMLButtonElement
			? control.type === 'submit'
			: control instanceof HTMLInputElement && (control.type === 'submit' || control.type === 'image')
	if (!isSubmit) return null
	return (control as HTMLButtonElement | HTMLInputElement).form ?? control.closest('form')
}

function controlsOf(form: HTMLFormElement): FormControlEl[] {
	return Array.from(form.querySelectorAll<FormControlEl>('input, select, textarea')).filter(
		(c) => !(c instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'image', 'reset'].includes(c.type)) && !c.disabled
	)
}

function isRequired(c: FormControlEl): boolean {
	return c.required || c.getAttribute('aria-required') === 'true'
}

function isEmpty(c: FormControlEl): boolean {
	if (c instanceof HTMLInputElement && c.type === 'checkbox') return !c.checked
	return c.value.trim() === ''
}

/**
 * Visible labels of required-but-empty controls and of controls Angular marks invalid.
 * The templates carry `required` and aria-required on required fields (the reactive forms have
 * novalidate, so the browser never checks them), and Angular's NgControlStatus adds the
 * ng-invalid class, which also covers min length, pattern and range errors.
 */
function invalidFieldLabels(form: HTMLFormElement): string[] {
	const labels: string[] = []
	const radiosSeen = new Set<string>()
	for (const c of controlsOf(form)) {
		if (c instanceof HTMLInputElement && c.type === 'radio') {
			if (radiosSeen.has(c.name)) continue
			radiosSeen.add(c.name)
			const group = Array.from(form.querySelectorAll<HTMLInputElement>(`input[type=radio]`)).filter((r) => r.name === c.name)
			if (group.some(isRequired) && !group.some((r) => r.checked)) labels.push(labelOf(c))
			continue
		}
		if ((isRequired(c) && isEmpty(c)) || c.classList.contains('ng-invalid')) labels.push(labelOf(c))
	}
	return [...new Set(labels)]
}

function labelOf(c: FormControlEl): string {
	const legend = c instanceof HTMLInputElement && c.type === 'radio' ? c.closest('fieldset')?.querySelector('legend') : null
	const text =
		legend?.textContent ??
		c.labels?.[0]?.textContent ??
		c.getAttribute('aria-label') ??
		c.getAttribute('placeholder') ??
		c.name ??
		c.id
	return (text || c.id || 'unnamed field').trim().replace(/\s+/g, ' ')
}

/** One "Label: value" line per control, for the confirmation dialog. Values are shown to the human only. */
function formSummary(form: HTMLFormElement): string {
	const lines: string[] = []
	const radiosSeen = new Set<string>()
	for (const c of controlsOf(form)) {
		if (c instanceof HTMLInputElement && c.type === 'password') continue
		let value: string
		if (c instanceof HTMLInputElement && c.type === 'radio') {
			if (radiosSeen.has(c.name)) continue
			radiosSeen.add(c.name)
			const checked = Array.from(form.querySelectorAll<HTMLInputElement>('input[type=radio]')).find((r) => r.name === c.name && r.checked)
			value = checked ? (checked.labels?.[0]?.textContent ?? checked.value).trim() : '(none)'
		} else if (c instanceof HTMLInputElement && c.type === 'checkbox') {
			value = c.checked ? 'Yes' : 'No'
		} else if (c instanceof HTMLSelectElement) {
			value = c.selectedOptions[0]?.textContent?.trim() || '(none)'
		} else {
			value = c.value.trim() === '' ? '(empty)' : c.value.trim()
		}
		if (value.length > 80) value = value.slice(0, 77) + '...'
		lines.push(`${labelOf(c)}: ${value}`)
	}
	return lines.join('\n')
}
