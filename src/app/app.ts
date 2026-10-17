import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'

import { RunLogComponent } from './shell/run-log'
import { SideNavComponent } from './shell/side-nav'
import { ToastComponent } from './shell/toast'
import { TopBarComponent } from './shell/top-bar'

@Component({
	selector: 'app-root',
	imports: [RouterOutlet, TopBarComponent, SideNavComponent, RunLogComponent, ToastComponent],
	templateUrl: './app.html',
	styleUrl: './app.css',
})
export class App {}
