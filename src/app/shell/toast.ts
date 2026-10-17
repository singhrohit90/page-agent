import { Component, inject } from '@angular/core'

import { ToastService } from '../state/toast.service'

@Component({
	selector: 'app-toast',
	template: `
		<div id="toast" role="status" class="toast-area">
			@if (toast.message()) {
				<div class="toast">{{ toast.message() }}</div>
			}
		</div>
	`,
})
export class ToastComponent {
	protected readonly toast = inject(ToastService)
}
