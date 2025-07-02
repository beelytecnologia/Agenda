import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseAgendaService, ListedBooking } from '../../../shared/services/supabase-agenda.service';
import { ButtonModule } from 'primeng/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import dayjs from 'dayjs';
import { switchMap, tap } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, ButtonModule, RouterLink],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.css']
})
export class MyBookingsComponent implements OnInit {
  private api = inject(SupabaseAgendaService);
  private route = inject(ActivatedRoute);
  bookings = signal<ListedBooking[]>([]);
  isLoading = signal(true);
  errorLoading = signal<string | null>(null);
  private routeSub: Subscription | undefined;

  ngOnInit() {
    this.loadBookingFromRoute();
  }

  loadBookingFromRoute() {
    // Cancela a inscrição anterior para evitar memory leaks
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }

    this.routeSub = this.route.paramMap.pipe(
      tap(() => { // Usamos tap para efeitos colaterais como setar o loading
        this.isLoading.set(true);
        this.errorLoading.set(null);
      }),
      switchMap(params => {
        const hash = params.get('viewHash'); // CORRIGIDO: de 'hash' para 'viewHash'
        console.log('[Component] Hash da URL:', hash); // LOG 3

        if (!hash) {
          this.errorLoading.set('Link de agendamento inválido ou ausente.');
          this.isLoading.set(false);
          return Promise.resolve(null);
        }
        return this.api.getBookingByHash(hash);
      })
    ).subscribe({
      next: (data) => {
        console.log('[Component] Dados recebidos do serviço:', data); // LOG 4
        this.bookings.set(data ? [data] : []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar agendamento:', err);
        this.errorLoading.set('Falha ao carregar o agendamento. Verifique o link e tente novamente.');
        this.isLoading.set(false);
      }
    });
  }

  async cancelBooking(booking: ListedBooking) {
    if (!booking.cancel_hash) {
      alert('Este agendamento não pode ser cancelado.');
      return;
    }

    if (confirm(`Tem certeza que deseja cancelar este agendamento?`)) {
      try {
        await this.api.cancelBooking(booking.id, booking.cancel_hash);
        alert('Agendamento cancelado com sucesso!');
        this.bookings.set([]); // Limpa o agendamento da tela
      } catch (error) {
        console.error('Erro ao cancelar agendamento:', error);
        alert('Falha ao cancelar o agendamento.');
      }
    }
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    return dayjs(dateString).format('DD/MM/YYYY HH:mm');
  }

  ngOnDestroy() {
    // Garante que a inscrição seja cancelada quando o componente for destruído
    if (this.routeSub) {
      this.routeSub.unsubscribe();

    }
  }
}
