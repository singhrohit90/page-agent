import { ScrollingModule } from '@angular/cdk/scrolling'
import { Component } from '@angular/core'

import { generateMeasurements } from '../../data/measurements'

@Component({
	selector: 'app-measurements',
	imports: [ScrollingModule],
	templateUrl: './measurements.html',
	styleUrl: './measurements.css',
})
export class MeasurementsPage {
	protected readonly items = generateMeasurements()
	protected trackById(_index: number, m: { id: string }): string {
		return m.id
	}
}
