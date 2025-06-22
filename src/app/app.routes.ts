// app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'agenda', pathMatch: 'full' },

  /* ⚠️  DEVE vir primeiro! */
  {
    path: 'agenda/:empresaSlug',
    loadComponent: () =>
      import('./scheduleModule/Components/schedule/schedule.component')
        .then(m => m.ScheduleComponent)
  },

  /* rota sem parâmetro continua funcionando para testes */
  {
    path: 'agenda',
    loadComponent: () =>
      import('./scheduleModule/Components/schedule/schedule.component')
        .then(m => m.ScheduleComponent)
  },

  {
    path: 'meus-agendamentos/:viewHash',
    loadComponent: () =>
      import('./scheduleModule/Components/my-bookings/my-bookings.component')
        .then(c => c.MyBookingsComponent)
  },

  { path: '**', redirectTo: 'agenda' }
];
