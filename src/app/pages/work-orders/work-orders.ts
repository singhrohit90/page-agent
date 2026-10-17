import { Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'

import { DemoStateService } from '../../state/demo-state.service'

@Component({
	selector: 'app-work-orders',
	imports: [RouterLink],
	templateUrl: './work-orders.html',
	styleUrl: './work-orders.css',
})
export class WorkOrdersPage {
	private readonly state = inject(DemoStateService)

	protected readonly rows = computed(() =>
		[...this.state.workOrders()].sort(
			(a, b) => Number(b.id.replace('WO-', '')) - Number(a.id.replace('WO-', ''))
		)
	)
}
