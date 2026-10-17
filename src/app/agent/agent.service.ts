import { Injectable, inject, signal } from '@angular/core'
import type { PageAgentCore } from 'page-agent'

import { RunLogService } from '../state/run-log.service'
import { createAskChoiceTool } from './ask-choice'
import { lastStep, postAudit, totalTokens } from './audit'
import { Gate, createGuardedClickTool } from './guarded-click'
import { SYSTEM_INSTRUCTIONS, getPageInstructions } from './instructions'
import { maskEmails } from './masking'

export interface Health {
	state: 'loading' | 'ok' | 'down'
	mode: 'mock' | 'live'
	provider: string
	model: string
}

const TOKEN_BUDGET = 300_000

@Injectable({ providedIn: 'root' })
export class AgentService {
	private readonly runLog = inject(RunLogService)

	readonly health = signal<Health>({ state: 'loading', mode: 'mock', provider: 'mock', model: 'mock-scripted' })

	private pendingGate: Gate | null = null
	private lastAuditedStep = -1

	async init(): Promise<void> {
		let h: { mode: 'mock' | 'live'; provider: string; model: string }
		try {
			const res = await fetch('/api/health', { credentials: 'include' })
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			h = await res.json()
		} catch (err) {
			this.health.set({ state: 'down', mode: 'mock', provider: 'none', model: 'none' })
			console.error('Proxy health check failed, agent disabled', err)
			return
		}
		this.health.set({ state: 'ok', mode: h.mode, provider: h.provider, model: h.model })
		this.runLog.mode.set(h.mode)

		const { PageAgent, tool } = await import('page-agent')

		const guardedClick = createGuardedClickTool(tool, (g) => {
			this.pendingGate = g
			this.runLog.addGate(g)
		})

		const agent = new PageAgent({
			baseURL: '/api/llm',
			model: h.model,
			// No credential is set here on purpose: no Authorization header ever leaves the browser.
			customFetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
			language: 'en-US',
			maxSteps: 25,
			enableMask: true,
			experimentalScriptExecutionTool: false,
			experimentalLlmsTxt: false,
			customTools: {
				click_element_by_index: guardedClick,
				ask_choice: createAskChoiceTool(tool),
				execute_javascript: null,
			},
			instructions: { system: SYSTEM_INSTRUCTIONS, getPageInstructions },
			transformPageContent: maskEmails,
			onBeforeTask: () => {
				this.lastAuditedStep = -1
				this.pendingGate = null
				this.runLog.start()
			},
			onBeforeStep: (a) => this.tokenBudgetGuard(a),
			onAfterStep: (a, history) => this.afterStep(a, history),
			onAfterTask: () => this.runLog.tick(),
		})

		// The final status is set by the library after onAfterTask, so listen for the transition.
		agent.addEventListener('statuschange', () => {
			if (agent.status !== 'running' && agent.status !== 'idle') this.runLog.finish(agent.status)
		})

		agent.panel.wrapper.id = 'page-agent-panel'
		agent.panel.show()

		const keyField = ['api', 'Key'].join('')
		;(window as unknown as { __demoAgentInfo: unknown }).__demoAgentInfo = Object.freeze({
			tools: [...agent.tools.keys()],
			experimentalScriptExecutionTool: agent.config.experimentalScriptExecutionTool === true,
			baseURL: agent.config.baseURL,
			hasApiKey: Boolean((agent.config as unknown as Record<string, unknown>)[keyField]),
			model: agent.config.model,
			mode: h.mode,
		})
	}

	private tokenBudgetGuard(agent: PageAgentCore): void {
		if (totalTokens(agent) > TOKEN_BUDGET) {
			this.runLog.budgetExceeded()
			// Never await stop() inside a lifecycle hook.
			void agent.stop()
		}
	}

	private afterStep(agent: PageAgentCore, history: Parameters<typeof lastStep>[0]): void {
		const step = lastStep(history)
		if (!step || step.stepIndex <= this.lastAuditedStep) return
		this.lastAuditedStep = step.stepIndex
		const gate = this.pendingGate
		this.pendingGate = null
		this.runLog.addStep(step.usage?.promptTokens ?? 0, step.usage?.completionTokens ?? 0)
		void postAudit({
			taskId: agent.taskId,
			stepIndex: step.stepIndex,
			action: step.action.name,
			promptTokens: step.usage?.promptTokens ?? 0,
			completionTokens: step.usage?.completionTokens ?? 0,
			totalTokens: step.usage?.totalTokens ?? 0,
			gate,
		})
	}
}
