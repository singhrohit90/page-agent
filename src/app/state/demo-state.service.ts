import { Injectable, effect, signal } from '@angular/core'

import { DEFAULT_SETTINGS, Settings } from '../data/settings'
import { SEED_WORK_ORDERS, WorkOrder } from '../data/work-orders'
import { clearWorkOrderDefaults } from './remembered-defaults'

export const STATE_KEY = 'pa-demo-state-v1'

interface Persisted {
	workOrders: WorkOrder[]
	settings: Settings
	decommissioned: string[]
}

function load(): Persisted {
	const seed: Persisted = {
		workOrders: SEED_WORK_ORDERS,
		settings: DEFAULT_SETTINGS,
		decommissioned: [],
	}
	try {
		const raw = localStorage.getItem(STATE_KEY)
		if (!raw) return seed
		const p = JSON.parse(raw) as Partial<Persisted>
		if (!Array.isArray(p.workOrders) || !p.settings || !Array.isArray(p.decommissioned)) return seed
		return { workOrders: p.workOrders, settings: { ...DEFAULT_SETTINGS, ...p.settings }, decommissioned: p.decommissioned }
	} catch {
		return seed
	}
}

@Injectable({ providedIn: 'root' })
export class DemoStateService {
	private readonly initial = load()
	readonly workOrders = signal<WorkOrder[]>(this.initial.workOrders)
	readonly settings = signal<Settings>(this.initial.settings)
	readonly decommissioned = signal<string[]>(this.initial.decommissioned)

	constructor() {
		effect(() => {
			const snapshot: Persisted = {
				workOrders: this.workOrders(),
				settings: this.settings(),
				decommissioned: this.decommissioned(),
			}
			try {
				localStorage.setItem(STATE_KEY, JSON.stringify(snapshot))
			} catch (err) {
				console.warn('Could not persist demo state', err)
			}
		})
	}

	nextWorkOrderId(): string {
		const max = this.workOrders().reduce((m, w) => Math.max(m, Number(w.id.replace('WO-', ''))), 0)
		return `WO-${max + 1}`
	}

	addWorkOrder(wo: WorkOrder): void {
		this.workOrders.update((list) => [...list, wo])
	}

	decommission(stationId: string): void {
		this.decommissioned.update((list) => (list.includes(stationId) ? list : [...list, stationId]))
	}

	resetAndClear(): void {
		try {
			localStorage.removeItem(STATE_KEY)
		} catch (err) {
			console.warn('Could not clear demo state', err)
		}
		clearWorkOrderDefaults()
	}
}
