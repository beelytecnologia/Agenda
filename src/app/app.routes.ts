// app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'agenda', pathMatch: 'full' },

  // 🔹 1º — rota MAIS específica (slug + fone)
// app.routes.ts
{
  path: 'agenda/:empresaSlug/:fone',               // <-- novo segmento
  loadComponent: () => import(
    './scheduleModule/Components/schedule/schedule.component'
  ).then(m => m.ScheduleComponent)
},

  // 🔹 2º — só o slug (continua funcionando)
  {
    path: 'agenda/:empresaSlug',
    loadComponent: () =>
      import('./scheduleModule/Components/schedule/schedule.component')
        .then(m => m.ScheduleComponent)
  },

  // 🔹 3º — sem parâmetros (ex.: testes locais)
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
