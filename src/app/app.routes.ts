import { Routes } from '@angular/router'

import { DashboardPage } from './pages/dashboard/dashboard'
import { MeasurementsPage } from './pages/measurements/measurements'
import { ResultsPage } from './pages/results/results'
import { SettingsPage } from './pages/settings/settings'
import { StationsPage } from './pages/stations/stations'
import { WorkOrderNewPage } from './pages/work-orders/work-order-new'
import { WorkOrdersPage } from './pages/work-orders/work-orders'

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'dashboard' },
	{ path: 'dashboard', component: DashboardPage },
	{ path: 'stations', component: StationsPage },
	{ path: 'results', component: ResultsPage },
	{ path: 'measurements', component: MeasurementsPage },
	{ path: 'work-orders', component: WorkOrdersPage },
	{ path: 'work-orders/new', component: WorkOrderNewPage },
	{ path: 'settings', component: SettingsPage },
	{ path: '**', redirectTo: 'dashboard' },
]
