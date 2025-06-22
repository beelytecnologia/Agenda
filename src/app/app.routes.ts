import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'agenda', pathMatch: 'full' },

  {
    path: 'agenda',
    loadComponent: () =>
      import('./scheduleModule/Components/schedule/schedule.component')
        .then(m => m.ScheduleComponent)
  },
  {
    path: 'meus-agendamentos/:viewHash', // Nova rota adicionada aqui
    loadComponent: () => import('./scheduleModule/Components/my-bookings/my-bookings.component').then(c => c.MyBookingsComponent)
  },
  { path: '**', redirectTo: 'agenda' } // redirecionamento corrigido
];
