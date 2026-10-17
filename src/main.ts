import { bootstrapApplication } from '@angular/platform-browser'

import { App } from './app/app'
import { appConfig } from './app/app.config'
import { buildDataCheck } from './app/data/data-check'

;(window as unknown as { __demoDataCheck: unknown }).__demoDataCheck = buildDataCheck()

bootstrapApplication(App, appConfig).catch((err) => console.error(err))
