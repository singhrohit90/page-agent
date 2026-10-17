export interface Settings {
	plantName: string
	timeZone: string
	yieldThreshold: number
	retentionDays: number
	emailNotifications: boolean
	refreshInterval: string
	shiftLeadEmail: string
}

export const TIME_ZONES = ['UTC', 'Europe/Berlin', 'America/Chicago', 'Asia/Shanghai', 'Asia/Kolkata']
export const REFRESH_INTERVALS = ['30 s', '1 min', '5 min']

export const DEFAULT_SETTINGS: Settings = {
	plantName: 'Demo Plant Alpha',
	timeZone: 'UTC',
	yieldThreshold: 90,
	retentionDays: 365,
	emailNotifications: true,
	refreshInterval: '1 min',
	shiftLeadEmail: 'shift.lead@example.test',
}
