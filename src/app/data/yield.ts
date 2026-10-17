export interface DailyYield {
	date: string
	fpy: number
}

const VALUES = [95.2, 94.8, 96.1, 95.5, 93.9, 94.4, 95.0, 96.3, 95.8, 94.1, 88.4, 92.7, 94.9, 95.6]

export const DAILY_YIELD: DailyYield[] = VALUES.map((fpy, i) => ({
	date: `2026-10-${String(3 + i).padStart(2, '0')}`,
	fpy,
}))
