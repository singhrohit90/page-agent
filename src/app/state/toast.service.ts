import { Injectable, signal } from '@angular/core'

@Injectable({ providedIn: 'root' })
export class ToastService {
	readonly message = signal('')
	private timer: ReturnType<typeof setTimeout> | undefined

	show(text: string): void {
		this.message.set(text)
		clearTimeout(this.timer)
		this.timer = setTimeout(() => this.message.set(''), 5000)
	}
}
