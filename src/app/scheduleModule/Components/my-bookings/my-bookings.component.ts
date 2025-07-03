import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseAgendaService, ListedBooking } from '../../../shared/services/supabase-agenda.service';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ActivatedRoute, RouterLink } from '@angular/router';
import dayjs from 'dayjs';
import { switchMap, tap } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, ButtonModule, RouterLink, ToastModule, DialogModule],
  providers: [MessageService],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.css']
})
export class MyBookingsComponent implements OnInit {
  private api = inject(SupabaseAgendaService);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  bookings = signal<ListedBooking[]>([]);
  isLoading = signal(true);
  errorLoading = signal<string | null>(null);
  private routeSub: Subscription | undefined;

  // Controle do modal
  showCancelDialog = signal(false);
  bookingToCancel: ListedBooking | null = null;

  ngOnInit() {
    this.loadBookingFromRoute();
  }

  loadBookingFromRoute() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }

    this.routeSub = this.route.paramMap.pipe(
      tap(() => {
        this.isLoading.set(true);
        this.errorLoading.set(null);
      }),
      switchMap(params => {
        const hash = params.get('viewHash');
        if (!hash) {
          this.errorLoading.set('Link de agendamento inválido ou ausente.');
          this.isLoading.set(false);
          return Promise.resolve(null);
        }
        return this.api.getBookingByHash(hash);
      })
    ).subscribe({
      next: (data) => {
        this.bookings.set(data ? [data] : []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorLoading.set('Falha ao carregar o agendamento. Verifique o link e tente novamente.');
        this.isLoading.set(false);
      }
    });
  }

  openCancelDialog(booking: ListedBooking) {
    if (!booking.cancel_hash) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Este agendamento não pode ser cancelado.' });
      return;
    }
    this.bookingToCancel = booking;
    this.showCancelDialog.set(true);
  }

  async confirmCancelBooking() {
    if (!this.bookingToCancel) return;
    try {
      await this.api.cancelBooking(this.bookingToCancel.id, this.bookingToCancel.cancel_hash);
      this.messageService.add({ severity: 'success', summary: 'Cancelado', detail: 'Agendamento cancelado com sucesso!' });
      this.bookings.set([]); // Limpa o agendamento da tela
    } catch (error) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao cancelar o agendamento.' });
    } finally {
      this.showCancelDialog.set(false);
      this.bookingToCancel = null;
    }
  }

  cancelDialogClose() {
    this.showCancelDialog.set(false);
    this.bookingToCancel = null;
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    return dayjs(dateString).format('DD/MM/YYYY HH:mm');
  }

  ngOnDestroy() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }
}
