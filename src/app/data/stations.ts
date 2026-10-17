export interface Station {
	id: string
	name: string
	line: 'L1' | 'L2' | 'L3' | 'L4'
	type: 'ICT' | 'FCT' | 'EOL' | 'AOI'
	status: 'Online' | 'Offline' | 'Maintenance' | 'Decommissioned'
	openAlarms: number
	lastCalibration: string
}

type Row = [id: string, status: Station['status'], openAlarms: number]

const ROWS: Row[] = [
	['ST-L1-ICT-01', 'Online', 0],
	['ST-L1-ICT-02', 'Online', 2],
	['ST-L1-FCT-01', 'Online', 0],
	['ST-L1-FCT-02', 'Maintenance', 1],
	['ST-L1-EOL-01', 'Online', 0],
	['ST-L1-AOI-01', 'Offline', 0],
	['ST-L2-ICT-01', 'Online', 0],
	['ST-L2-FCT-01', 'Online', 1],
	['ST-L2-FCT-02', 'Maintenance', 0],
	['ST-L2-FCT-03', 'Offline', 3],
	['ST-L2-FCT-04', 'Online', 0],
	['ST-L2-FCT-05', 'Offline', 1],
	['ST-L2-EOL-01', 'Online', 0],
	['ST-L2-AOI-01', 'Offline', 0],
	['ST-L3-ICT-01', 'Online', 0],
	['ST-L3-FCT-01', 'Offline', 0],
	['ST-L3-EOL-01', 'Online', 1],
	['ST-L3-EOL-02', 'Online', 0],
	['ST-L3-AOI-01', 'Maintenance', 0],
	['ST-L4-ICT-01', 'Online', 0],
	['ST-L4-FCT-01', 'Online', 0],
	['ST-L4-FCT-02', 'Offline', 2],
	['ST-L4-EOL-01', 'Online', 0],
	['ST-L4-AOI-01', 'Online', 0],
]

export const STATIONS: Station[] = ROWS.map(([id, status, openAlarms], i) => {
	const [, line, type, nn] = id.split('-') as [string, Station['line'], Station['type'], string]
	const day = 1 + (((i + 1) * 7) % 28)
	return {
		id,
		name: `${type} ${line}-${nn}`,
		line,
		type,
		status,
		openAlarms,
		lastCalibration: `2026-09-${String(day).padStart(2, '0')}`,
	}
})
