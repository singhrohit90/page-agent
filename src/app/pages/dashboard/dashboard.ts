import { AfterViewInit, Component, ElementRef, inject, viewChild } from '@angular/core'

import { DAILY_YIELD } from '../../data/yield'
import { DemoStateService } from '../../state/demo-state.service'

@Component({
	selector: 'app-dashboard',
	templateUrl: './dashboard.html',
	styleUrl: './dashboard.css',
})
export class DashboardPage implements AfterViewInit {
	protected readonly state = inject(DemoStateService)
	private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('chart')

	ngAfterViewInit(): void {
		this.draw(this.canvasRef().nativeElement)
	}

	/** All text is drawn on the canvas. No chart values exist anywhere in the DOM. */
	private draw(canvas: HTMLCanvasElement): void {
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		const W = canvas.width
		const H = canvas.height
		const left = 50
		const right = 20
		const top = 20
		const bottom = 40
		const plotW = W - left - right
		const plotH = H - top - bottom
		const yMin = 85
		const yMax = 100
		const y = (v: number) => top + plotH - ((v - yMin) / (yMax - yMin)) * plotH
		const x = (i: number) => left + (i / (DAILY_YIELD.length - 1)) * plotW

		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, W, H)

		ctx.font = '12px sans-serif'
		ctx.fillStyle = '#52606d'
		ctx.strokeStyle = '#e4e8ec'
		ctx.lineWidth = 1
		ctx.textAlign = 'right'
		ctx.textBaseline = 'middle'
		for (const v of [85, 90, 95, 100]) {
			ctx.beginPath()
			ctx.moveTo(left, y(v))
			ctx.lineTo(W - right, y(v))
			ctx.stroke()
			ctx.fillText(String(v), left - 8, y(v))
		}

		ctx.textAlign = 'center'
		ctx.textBaseline = 'top'
		DAILY_YIELD.forEach((d, i) => {
			ctx.fillText(d.date.slice(5), x(i), H - bottom + 10)
		})

		ctx.strokeStyle = '#1d4ed8'
		ctx.lineWidth = 2
		ctx.beginPath()
		DAILY_YIELD.forEach((d, i) => {
			if (i === 0) ctx.moveTo(x(i), y(d.fpy))
			else ctx.lineTo(x(i), y(d.fpy))
		})
		ctx.stroke()

		ctx.fillStyle = '#1d4ed8'
		DAILY_YIELD.forEach((d, i) => {
			ctx.beginPath()
			ctx.arc(x(i), y(d.fpy), 4, 0, Math.PI * 2)
			ctx.fill()
		})
	}
}
