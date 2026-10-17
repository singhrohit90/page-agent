import { Component, inject } from '@angular/core'

import { AgentService } from '../agent/agent.service'

@Component({
	selector: 'app-top-bar',
	template: `
		<header class="top-bar" data-page-agent-ignore="true">
			<span class="brand">TestFloor Admin (demo)</span>
			<span class="badges">
				<span class="badge grey">Synthetic data only</span>
				@let h = agent.health();
				@switch (h.state) {
					@case ('down') {
						<span id="llm-badge" class="badge red">Proxy not reachable - agent disabled</span>
					}
					@case ('ok') {
						@if (h.mode === 'mock') {
							<span id="llm-badge" class="badge orange">MOCK LLM - scripted replies, no AI model is called</span>
						} @else {
							<span id="llm-badge" class="badge green">LIVE LLM: {{ h.provider }} / {{ h.model }}</span>
						}
					}
					@default {
						<span id="llm-badge" class="badge grey">Checking proxy...</span>
					}
				}
			</span>
		</header>
	`,
})
export class TopBarComponent {
	protected readonly agent = inject(AgentService)
}
