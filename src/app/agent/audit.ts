import type { AgentStepEvent, HistoricalEvent, PageAgentCore } from 'page-agent'

import type { Gate } from './guarded-click'

export interface AuditPayload {
	taskId: string
	stepIndex: number
	action: string
	promptTokens: number
	completionTokens: number
	totalTokens: number
	gate: Gate | null
}

/**
 * Sends metadata only to the proxy: tool name and token counts. Never the tool input,
 * the page text or typed values.
 */
export async function postAudit(payload: AuditPayload): Promise<void> {
	try {
		const res = await fetch('/api/audit', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		})
		if (!res.ok) console.warn(`Audit POST failed: HTTP ${res.status}`)
	} catch (err) {
		console.warn('Audit POST failed', err)
	}
}

export function lastStep(history: HistoricalEvent[]): AgentStepEvent | undefined {
	for (let i = history.length - 1; i >= 0; i--) {
		const ev = history[i]
		if (ev.type === 'step') return ev
	}
	return undefined
}

export function totalTokens(agent: PageAgentCore): number {
	let sum = 0
	for (const ev of agent.history) {
		if (ev.type === 'step') sum += ev.usage?.totalTokens ?? 0
	}
	return sum
}
