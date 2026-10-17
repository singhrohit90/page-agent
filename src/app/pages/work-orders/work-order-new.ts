import { Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'

import { STATIONS } from '../../data/stations'
import { TECHNICIANS } from '../../data/technicians'
import { PRIORITIES, WORK_ORDER_TYPES, WorkOrder } from '../../data/work-orders'
import { DemoStateService } from '../../state/demo-state.service'
import { RememberedDefaultsService } from '../../state/remembered-defaults'
import { ToastService } from '../../state/toast.service'

@Component({
	selector: 'app-work-order-new',
	imports: [ReactiveFormsModule, RouterLink],
	templateUrl: './work-order-new.html',
	styleUrl: './work-orders.css',
})
export class WorkOrderNewPage {
	private readonly state = inject(DemoStateService)
	private readonly router = inject(Router)
	private readonly toast = inject(ToastService)
	private readonly remembered = inject(RememberedDefaultsService)

	protected readonly stationIds = STATIONS.map((s) => s.id)
	protected readonly types = WORK_ORDER_TYPES
	protected readonly priorities = PRIORITIES
	protected readonly technicians = TECHNICIANS

	protected readonly submitted = signal(false)
	// Bumped on every form change so error text refreshes under zoneless change detection.
	private readonly version = signal(0)

	protected readonly form = new FormGroup({
		title: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required, Validators.minLength(3), Validators.maxLength(80)],
		}),
		station: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
		priority: new FormControl('Medium', { nonNullable: true, validators: [Validators.required] }),
		type: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
		due: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
		assignee: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
		failureCode: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^E-\d{3}$/)] }),
		description: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required, Validators.minLength(20)],
		}),
		notify: new FormControl(false, { nonNullable: true }),
	})

	constructor() {
		this.form.valueChanges.subscribe(() => this.version.update((v) => v + 1))
	}

	protected error(name: 'title' | 'station' | 'type' | 'due' | 'assignee' | 'failureCode' | 'description'): string {
		this.version()
		if (!this.submitted()) return ''
		const errors = this.form.controls[name].errors
		if (!errors) return ''
		switch (name) {
			case 'title':
				return errors['required'] ? 'Title is required.' : 'Title must be 3 to 80 characters.'
			case 'station':
				return 'Station is required.'
			case 'type':
				return 'Type is required.'
			case 'due':
				return 'Due date is required.'
			case 'assignee':
				return 'Assignee is required.'
			case 'failureCode':
				return 'Failure code must look like E-123.'
			case 'description':
				return errors['required'] ? 'Description is required.' : 'Description must be at least 20 characters.'
		}
	}

	protected submit(): void {
		this.submitted.set(true)
		this.version.update((v) => v + 1)
		if (this.form.invalid) return
		const v = this.form.getRawValue()
		const id = this.state.nextWorkOrderId()
		const wo: WorkOrder = {
			id,
			title: v.title,
			stationId: v.station,
			priority: v.priority as WorkOrder['priority'],
			type: v.type as WorkOrder['type'],
			due: v.due,
			assignee: v.assignee,
			failureCode: v.failureCode,
			description: v.description,
			notifyShiftLead: v.notify,
			status: 'Open',
		}
		this.state.addWorkOrder(wo)
		// Select-type choices only. Title, description and failure code are never remembered.
		this.remembered.remember(wo)
		void this.router.navigate(['/work-orders'])
		this.toast.show(`Work order ${id} created`)
	}
}
