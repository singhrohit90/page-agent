import { Component } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'

@Component({
	selector: 'app-side-nav',
	imports: [RouterLink, RouterLinkActive],
	template: `
		<nav class="side-nav">
			<a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
			<a routerLink="/stations" routerLinkActive="active">Stations</a>
			<a routerLink="/results" routerLinkActive="active">Results</a>
			<a routerLink="/measurements" routerLinkActive="active">Measurements</a>
			<a routerLink="/work-orders" routerLinkActive="active">Work orders</a>
			<a routerLink="/settings" routerLinkActive="active">Settings</a>
		</nav>
	`,
})
export class SideNavComponent {}
