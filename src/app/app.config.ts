import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'

import { AgentService } from './agent/agent.service'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideRouter(routes, withComponentInputBinding()),
		// Not awaited on purpose: the UI renders even if the proxy is down.
		provideAppInitializer(() => {
			void inject(AgentService).init()
		}),
	],
}
