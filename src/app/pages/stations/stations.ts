import { Component, computed, inject, input } from '@angular/core'
import { Router, RouterLink } from '@angular/router'

import { STATIONS, Station } from '../../data/stations'
import { DemoStateService } from '../../state/demo-state.service'

@Component({
	selector: 'app-stations',
	imports: [RouterLink],
	templateUrl: './stations.html',
	styleUrl: './stations.css',
})
export class StationsPage {
	private readonly router = inject(Router)
	private readonly state = inject(DemoStateService)

	// Bound from query params through withComponentInputBinding().
	readonly q = input<string | undefined>()
	readonly line = input<string | undefined>()
	readonly type = input<string | undefined>()
	readonly status = input<string | undefined>()
	readonly alarms = input<string | undefined>()

	protected readonly total = STATIONS.length

	protected readonly rows = computed<Station[]>(() => {
		const decommissioned = this.state.decommissioned()
		const q = (this.q() ?? '').trim().toLowerCase()
		const line = this.line() ?? ''
		const type = this.type() ?? ''
		const status = this.status() ?? ''
		const alarms = this.alarms() === '1'
		return STATIONS.map((s) =>
			decommissioned.includes(s.id) ? { ...s, status: 'Decommissioned' as const } : s
		).filter(
			(s) =>
				(!q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) &&
				(!line || s.line === line) &&
				(!type || s.type === type) &&
				(!status || s.status === status) &&
				(!alarms || s.openAlarms > 0)
		)
	})

	protected setParam(key: string, value: string): void {
		void this.router.navigate([], {
			queryParams: { [key]: value || null },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		})
	}

	protected clear(): void {
		void this.router.navigate([], {
			queryParams: { q: null, line: null, type: null, status: null, alarms: null },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		})
	}

	protected decommission(id: string): void {
		if (window.confirm(`Decommission ${id}? This is a demo.`)) {
			this.state.decommission(id)
		}
	}
}
