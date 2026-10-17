import { Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'

import { RESULTS, TestResult } from '../../data/results'
import { STATIONS } from '../../data/stations'

type SortKey = 'serial' | 'stationId' | 'product' | 'result' | 'cycleTimeS' | 'testedAt' | 'failureCode'

interface Column {
	key: SortKey
	title: string
}

@Component({
	selector: 'app-results',
	templateUrl: './results.html',
	styleUrl: './results.css',
})
export class ResultsPage {
	private readonly router = inject(Router)

	readonly station = input<string | undefined>()
	readonly result = input<string | undefined>()

	protected readonly stationIds = STATIONS.map((s) => s.id)
	protected readonly total = RESULTS.length
	protected readonly columns: Column[] = [
		{ key: 'serial', title: 'Serial' },
		{ key: 'stationId', title: 'Station' },
		{ key: 'product', title: 'Product' },
		{ key: 'result', title: 'Result' },
		{ key: 'cycleTimeS', title: 'Cycle time (s)' },
		{ key: 'testedAt', title: 'Tested at' },
		{ key: 'failureCode', title: 'Failure code' },
	]

	protected readonly sortKey = signal<SortKey>('testedAt')
	protected readonly sortDir = signal<'asc' | 'desc'>('desc')

	protected readonly rows = computed<TestResult[]>(() => {
		const station = this.station() ?? ''
		const result = this.result() ?? ''
		const key = this.sortKey()
		const dir = this.sortDir() === 'asc' ? 1 : -1
		const filtered = RESULTS.filter((r) => (!station || r.stationId === station) && (!result || r.result === result))
		// Array.prototype.sort is stable, so ties keep data order.
		return [...filtered].sort((a, b) => {
			const av = a[key]
			const bv = b[key]
			if (av === bv) return 0
			return (av < bv ? -1 : 1) * dir
		})
	})

	protected ariaSort(key: SortKey): 'none' | 'ascending' | 'descending' {
		if (this.sortKey() !== key) return 'none'
		return this.sortDir() === 'asc' ? 'ascending' : 'descending'
	}

	protected sortBy(key: SortKey): void {
		if (this.sortKey() === key) {
			this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'))
		} else {
			this.sortKey.set(key)
			this.sortDir.set('asc')
		}
	}

	protected setParam(key: string, value: string): void {
		void this.router.navigate([], {
			queryParams: { [key]: value || null },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		})
	}
}
