import { STATIONS } from './stations'

export interface Measurement {
	id: string
	stationId: string
	parameter: 'Vbus' | 'Icc' | 'Leak' | 'Torque'
	value: string
	status: 'PASS' | 'FAIL'
	timestamp: string
}

const PARAMS = ['Vbus', 'Icc', 'Leak', 'Torque'] as const

export function generateMeasurements(): Measurement[] {
	const start = Date.UTC(2026, 9, 16, 0, 0, 0)
	const p = (n: number) => String(n).padStart(2, '0')
	const out: Measurement[] = []
	for (let i = 1; i <= 10000; i++) {
		const d = new Date(start + i * 8000)
		out.push({
			id: 'M-' + String(i).padStart(5, '0'),
			stationId: STATIONS[i % 24].id,
			parameter: PARAMS[i % 4],
			value: (10 + ((i * 7919) % 1000) / 100).toFixed(2),
			status: i % 37 === 0 || i % 53 === 0 ? 'FAIL' : 'PASS',
			timestamp: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
		})
	}
	return out
}
