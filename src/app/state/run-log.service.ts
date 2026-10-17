import { Injectable, signal } from '@angular/core'

export type Gate = 'approved' | 'denied' | 'blocked-unresolved' | 'refused-missing-fields'

@Injectable({ providedIn: 'root' })
export class RunLogService {
	readonly status = signal('idle')
	readonly steps = signal(0)
	readonly durationS = signal(0)
	readonly promptTokens = signal(0)
	readonly completionTokens = signal(0)
	readonly approved = signal(0)
	readonly denied = signal(0)
	// Submits refused before any dialog because required fields were empty. Not a denied confirmation.
	readonly refused = signal(0)
	readonly mode = signal('-')

	private startedAt = 0
	private budgetStopped = false

	start(): void {
		this.status.set('running')
		this.steps.set(0)
		this.durationS.set(0)
		this.promptTokens.set(0)
		this.completionTokens.set(0)
		this.approved.set(0)
		this.denied.set(0)
		this.refused.set(0)
		this.budgetStopped = false
		this.startedAt = performance.now()
	}

	tick(): void {
		this.durationS.set((performance.now() - this.startedAt) / 1000)
	}

	addStep(promptTokens: number, completionTokens: number): void {
		this.steps.update((n) => n + 1)
		this.promptTokens.update((n) => n + promptTokens)
		this.completionTokens.update((n) => n + completionTokens)
		this.tick()
	}

	addGate(g: Gate | null): void {
		if (g === 'approved') this.approved.update((n) => n + 1)
		if (g === 'denied') this.denied.update((n) => n + 1)
		if (g === 'refused-missing-fields') this.refused.update((n) => n + 1)
	}

	budgetExceeded(): void {
		this.budgetStopped = true
		this.status.set('stopped: token budget 300k exceeded')
	}

	finish(finalStatus: string): void {
		this.tick()
		this.status.set(this.budgetStopped ? 'stopped: token budget 300k exceeded' : finalStatus)
	}
}
