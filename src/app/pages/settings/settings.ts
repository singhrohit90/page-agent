import { Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'

import { REFRESH_INTERVALS, Settings, TIME_ZONES } from '../../data/settings'
import { DemoStateService } from '../../state/demo-state.service'
import { RememberedDefaultsService } from '../../state/remembered-defaults'
import { ToastService } from '../../state/toast.service'

@Component({
	selector: 'app-settings',
	imports: [ReactiveFormsModule],
	templateUrl: './settings.html',
	styleUrl: './settings.css',
})
export class SettingsPage {
	private readonly state = inject(DemoStateService)
	private readonly toast = inject(ToastService)
	protected readonly remembered = inject(RememberedDefaultsService)

	protected readonly timeZones = TIME_ZONES
	protected readonly intervals = REFRESH_INTERVALS
	protected readonly saved = signal(false)
	protected readonly submitted = signal(false)
	private readonly version = signal(0)
	private savedTimer: ReturnType<typeof setTimeout> | undefined

	protected readonly form: FormGroup<{
		plantName: FormControl<string>
		timeZone: FormControl<string>
		yieldThreshold: FormControl<number | null>
		retentionDays: FormControl<number | null>
		emailNotifications: FormControl<boolean>
		refreshInterval: FormControl<string>
		shiftLeadEmail: FormControl<string>
	}>

	constructor() {
		const s = this.state.settings()
		this.form = new FormGroup({
			plantName: new FormControl(s.plantName, { nonNullable: true, validators: [Validators.required] }),
			timeZone: new FormControl(s.timeZone, { nonNullable: true, validators: [Validators.required] }),
			yieldThreshold: new FormControl<number | null>(s.yieldThreshold, [
				Validators.required,
				Validators.min(50),
				Validators.max(100),
			]),
			retentionDays: new FormControl<number | null>(s.retentionDays, [
				Validators.required,
				Validators.min(30),
				Validators.max(3650),
			]),
			emailNotifications: new FormControl(s.emailNotifications, { nonNullable: true }),
			refreshInterval: new FormControl(s.refreshInterval, { nonNullable: true, validators: [Validators.required] }),
			shiftLeadEmail: new FormControl(s.shiftLeadEmail, { nonNullable: true, validators: [Validators.required] }),
		})
		this.form.valueChanges.subscribe(() => this.version.update((v) => v + 1))
	}

	protected invalid(name: keyof Settings): boolean {
		this.version()
		return this.submitted() && this.form.controls[name].invalid
	}

	protected save(): void {
		this.submitted.set(true)
		this.version.update((v) => v + 1)
		if (this.form.invalid) return
		const v = this.form.getRawValue()
		this.state.settings.set({
			plantName: v.plantName,
			timeZone: v.timeZone,
			yieldThreshold: Number(v.yieldThreshold),
			retentionDays: Number(v.retentionDays),
			emailNotifications: v.emailNotifications,
			refreshInterval: v.refreshInterval,
			shiftLeadEmail: v.shiftLeadEmail,
		})
		this.saved.set(true)
		clearTimeout(this.savedTimer)
		this.savedTimer = setTimeout(() => this.saved.set(false), 5000)
		this.toast.show('Settings saved')
	}

	protected hasRemembered(): boolean {
		const d = this.remembered.workOrder()
		return Boolean(d.priority || d.type || d.assignee)
	}

	protected resetData(): void {
		if (window.confirm('Reset all demo data?')) {
			this.state.resetAndClear()
			window.location.reload()
		}
	}

	protected deletePlant(): void {
		window.alert('Delete plant is disabled in this demo.')
	}
}
