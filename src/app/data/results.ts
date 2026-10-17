import { STATIONS } from './stations'

export interface TestResult {
	serial: string
	stationId: string
	product: 'PWR-CTRL-200' | 'SENSOR-HUB-12' | 'GATEWAY-X3'
	result: 'PASS' | 'FAIL'
	cycleTimeS: number
	testedAt: string
	failureCode: string
}

const FIXED: TestResult[] = [
	{ serial: 'SN-24A0117', stationId: 'ST-L2-FCT-01', product: 'GATEWAY-X3', result: 'FAIL', cycleTimeS: 98.4, testedAt: '2026-10-12 09:14', failureCode: 'E-117' },
	{ serial: 'SN-24A0118', stationId: 'ST-L3-EOL-01', product: 'PWR-CTRL-200', result: 'FAIL', cycleTimeS: 61.2, testedAt: '2026-10-12 10:02', failureCode: 'E-221' },
	{ serial: 'SN-24A0119', stationId: 'ST-L3-EOL-01', product: 'PWR-CTRL-200', result: 'FAIL', cycleTimeS: 59.8, testedAt: '2026-10-12 10:40', failureCode: 'E-221' },
	{ serial: 'SN-24A0120', stationId: 'ST-L3-EOL-01', product: 'PWR-CTRL-200', result: 'PASS', cycleTimeS: 44.0, testedAt: '2026-10-12 11:05', failureCode: '' },
	{ serial: 'SN-24A0121', stationId: 'ST-L1-ICT-02', product: 'SENSOR-HUB-12', result: 'PASS', cycleTimeS: 99.1, testedAt: '2026-10-12 11:30', failureCode: '' },
]

const PRODUCTS = ['PWR-CTRL-200', 'SENSOR-HUB-12', 'GATEWAY-X3'] as const
const CODES = ['E-104', 'E-117', 'E-305', 'E-410']

function fmt(ms: number): string {
	const d = new Date(ms)
	const p = (n: number) => String(n).padStart(2, '0')
	return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function generate(): TestResult[] {
	const start = Date.UTC(2026, 9, 1, 6, 0)
	const out: TestResult[] = []
	for (let i = 0; i < 55; i++) {
		let stationId = STATIONS[(i * 7) % 24].id
		if (stationId === 'ST-L3-EOL-01') stationId = STATIONS[17].id
		const fail = i % 6 === 0
		out.push({
			serial: `SN-24B${1000 + i}`,
			stationId,
			product: PRODUCTS[i % 3],
			result: fail ? 'FAIL' : 'PASS',
			cycleTimeS: Math.round((30 + ((i * 13) % 50) + (i % 10) / 10) * 10) / 10,
			testedAt: fmt(start + i * 170 * 60_000),
			failureCode: fail ? CODES[i % 4] : '',
		})
	}
	return out
}

export const RESULTS: TestResult[] = [...FIXED, ...generate()]
