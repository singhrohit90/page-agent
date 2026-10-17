import { Injectable, signal } from '@angular/core'

import { TECHNICIANS } from '../data/technicians'
import { PRIORITIES, WORK_ORDER_TYPES, WorkOrder } from '../data/work-orders'

/**
 * One key per demo user. The demo has no login, so a browser profile is the demo user.
 * Only select-type choices are stored. Title, description and failure code are never stored.
 */
export const DEFAULTS_KEY = 'testfloor.defaults.workOrder'

export interface WorkOrderDefaults {
	priority?: WorkOrder['priority']
	type?: WorkOrder['type']
	assignee?: string
}

/** Keeps only known values, so a hand-edited or stale entry cannot inject free text. */
function sanitize(raw: unknown): WorkOrderDefaults {
	const r = (raw ?? {}) as Record<string, unknown>
	const out: WorkOrderDefaults = {}
	if (PRIORITIES.includes(r['priority'] as WorkOrder['priority'])) out.priority = r['priority'] as WorkOrder['priority']
	if (WORK_ORDER_TYPES.includes(r['type'] as WorkOrder['type'])) out.type = r['type'] as WorkOrder['type']
	if (typeof r['assignee'] === 'string' && TECHNICIANS.includes(r['assignee'])) out.assignee = r['assignee']
	return out
}

export function readWorkOrderDefaults(): WorkOrderDefaults {
	try {
		const raw = localStorage.getItem(DEFAULTS_KEY)
		return raw ? sanitize(JSON.parse(raw)) : {}
	} catch (err) {
		console.warn('Could not read remembered defaults', err)
		return {}
	}
}

export function writeWorkOrderDefaults(d: WorkOrderDefaults): void {
	try {
		localStorage.setItem(DEFAULTS_KEY, JSON.stringify(sanitize(d)))
	} catch (err) {
		console.warn('Could not store remembered defaults', err)
	}
}

export function clearWorkOrderDefaults(): void {
	try {
		localStorage.removeItem(DEFAULTS_KEY)
	} catch (err) {
		console.warn('Could not clear remembered defaults', err)
	}
}

/** Signal wrapper so the Settings page updates when defaults change. */
@Injectable({ providedIn: 'root' })
export class RememberedDefaultsService {
	readonly workOrder = signal<WorkOrderDefaults>(readWorkOrderDefaults())

	remember(wo: Pick<WorkOrder, 'priority' | 'type' | 'assignee'>): void {
		const d: WorkOrderDefaults = { priority: wo.priority, type: wo.type, assignee: wo.assignee }
		writeWorkOrderDefaults(d)
		this.workOrder.set(readWorkOrderDefaults())
	}

	clear(): void {
		clearWorkOrderDefaults()
		this.workOrder.set({})
	}
}
