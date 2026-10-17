export interface WorkOrder {
	id: string
	title: string
	stationId: string
	priority: 'Low' | 'Medium' | 'High' | 'Critical'
	type: 'Calibration' | 'Fixture repair' | 'Software update' | 'Preventive maintenance'
	due: string
	assignee: string
	failureCode: string
	description: string
	notifyShiftLead: boolean
	status: 'Open'
}

export const WORK_ORDER_TYPES: WorkOrder['type'][] = [
	'Calibration',
	'Fixture repair',
	'Software update',
	'Preventive maintenance',
]

export const PRIORITIES: WorkOrder['priority'][] = ['Low', 'Medium', 'High', 'Critical']

export const SEED_WORK_ORDERS: WorkOrder[] = [
	{ id: 'WO-1040', title: 'Replace pogo pins on ICT fixture', stationId: 'ST-L1-ICT-01', priority: 'Medium', type: 'Fixture repair', due: '2026-10-20', assignee: 'Tomas Lindqvist', failureCode: 'E-104', description: 'Pogo pins worn after 200k cycles, replace full set.', notifyShiftLead: false, status: 'Open' },
	{ id: 'WO-1041', title: 'Update FCT test program to v4.2', stationId: 'ST-L2-FCT-01', priority: 'Low', type: 'Software update', due: '2026-10-28', assignee: 'Aiko Tanaka', failureCode: '', description: 'Roll out test program v4.2 with new limits file.', notifyShiftLead: false, status: 'Open' },
	{ id: 'WO-1042', title: 'Quarterly preventive maintenance EOL', stationId: 'ST-L4-EOL-01', priority: 'Medium', type: 'Preventive maintenance', due: '2026-10-31', assignee: 'Marcus Okafor', failureCode: '', description: 'Quarterly PM checklist for end-of-line tester.', notifyShiftLead: true, status: 'Open' },
]
