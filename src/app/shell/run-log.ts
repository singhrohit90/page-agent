import { DecimalPipe } from '@angular/common'
import { Component, inject } from '@angular/core'

import { RunLogService } from '../state/run-log.service'

@Component({
	selector: 'app-run-log',
	imports: [DecimalPipe],
	template: `
		<aside id="run-log" class="run-log" data-page-agent-ignore="true">
			<h3>Run log</h3>
			<dl>
				<dt>Status</dt>
				<dd id="run-status">{{ log.status() }}</dd>
				<dt>Steps</dt>
				<dd id="run-steps">{{ log.steps() }}</dd>
				<dt>Duration (s)</dt>
				<dd id="run-duration">{{ log.durationS() | number: '1.1-1' }}</dd>
				<dt>Prompt tokens</dt>
				<dd id="run-prompt-tokens">{{ log.promptTokens() }}</dd>
				<dt>Completion tokens</dt>
				<dd id="run-completion-tokens">{{ log.completionTokens() }}</dd>
				<dt>Write confirmations</dt>
				<dd>approved <span id="run-approved">{{ log.approved() }}</span>, denied <span id="run-denied">{{ log.denied() }}</span></dd>
				<dt>Refused: missing fields</dt>
				<dd id="run-refused">{{ log.refused() }}</dd>
				<dt>Mode</dt>
				<dd id="run-mode">{{ log.mode() }}</dd>
			</dl>
		</aside>
	`,
})
export class RunLogComponent {
	protected readonly log = inject(RunLogService)
}
