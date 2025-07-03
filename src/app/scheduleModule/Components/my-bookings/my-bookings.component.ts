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

// Cria um novo tipo que estende ListedBooking e adiciona a propriedade 'status'
type BookingWithStatus = ListedBooking & { status?: 'confirmed' | 'cancelled' };

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, ButtonModule, ToastModule, DialogModule],
  providers: [MessageService],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.css']
})
export class MyBookingsComponent implements OnInit {
  private api = inject(SupabaseAgendaService);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);

  // Usa o novo tipo BookingWithStatus para o signal de bookings
  bookings = signal<BookingWithStatus[]>([]);
  isLoading = signal(true);
  errorLoading = signal<string | null>(null);
  private routeSub: Subscription | undefined;

  // Controle do modal
  showCancelDialog = signal(false);
  // Usa o novo tipo aqui também
  bookingToCancel: BookingWithStatus | null = null;

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
        this.bookings.set(
          data
            ? [
                {
                  ...data,
                  status:
                    data.status === 'confirmed' || data.status === 'cancelled'
                      ? data.status
                      : undefined,
                },
              ]
            : []
        );
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorLoading.set('Falha ao carregar o agendamento. Verifique o link e tente novamente.');
        this.isLoading.set(false);
      }
    });
  }

  openCancelDialog(booking: BookingWithStatus) {
    if (!booking.cancel_hash) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Este agendamento não pode ser cancelado.' });
      return;
    }
    this.bookingToCancel = booking;
    this.showCancelDialog.set(true);
  }

  async confirmCancelBooking() {
    if (!this.bookingToCancel || !this.bookingToCancel.cancel_hash) return;
    const { id, cancel_hash } = this.bookingToCancel;

    try {
      // 1. Cancela no Supabase
      await this.api.cancelBooking(id, cancel_hash);

      // 2. Dispara o webhook de cancelamento
      await fetch('https://n8n.grupobeely.com.br/webhook/cancelado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_hash })
      });

      this.messageService.add({ severity: 'success', summary: 'Cancelado', detail: 'Agendamento cancelado com sucesso!' });

      // 3. Atualiza o status na tela para 'cancelled' em vez de remover
      this.bookings.update(bookings =>
        bookings.map(b => (b.id === id ? { ...b, status: 'cancelled' } : b))
      );

    } catch (error) {
      console.error('Falha ao cancelar o agendamento:', error);
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
