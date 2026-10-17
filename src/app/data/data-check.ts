import { generateMeasurements } from './measurements'
import { RESULTS } from './results'
import { STATIONS } from './stations'
import { DAILY_YIELD } from './yield'

/** Ground truth for tests. Exposed on window as a JS global, never rendered in the DOM. */
export function buildDataCheck() {
	const measurements = generateMeasurements()
	const lowest = DAILY_YIELD.reduce((a, b) => (b.fpy < a.fpy ? b : a))
	const failRows = RESULTS.filter((r) => r.result === 'FAIL')
	const topFail = failRows.reduce((a, b) => (b.cycleTimeS > a.cycleTimeS ? b : a))
	return {
		stationsCount: STATIONS.length,
		offlineFctL2: STATIONS.filter((s) => s.line === 'L2' && s.type === 'FCT' && s.status === 'Offline').map((s) => s.id),
		station10Calibration: STATIONS[9].lastCalibration,
		resultsCount: RESULTS.length,
		failResultsCount: failRows.length,
		topFailByCycle: topFail.serial,
		l3Eol01Codes: [...new Set(RESULTS.filter((r) => r.stationId === 'ST-L3-EOL-01' && r.failureCode).map((r) => r.failureCode))],
		measurementsCount: measurements.length,
		measurementFailCount: measurements.filter((m) => m.status === 'FAIL').length,
		m00001Value: measurements[0].value,
		m00037Value: measurements[36].value,
		lowestYieldDate: lowest.date,
		lowestYieldValue: lowest.fpy,
	}
}
