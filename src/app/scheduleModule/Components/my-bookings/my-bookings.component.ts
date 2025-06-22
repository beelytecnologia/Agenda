import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseAgendaService, ListedBooking } from '../../../shared/services/supabase-agenda.service';
import { ButtonModule } from 'primeng/button';
import { RouterLink } from '@angular/router';
import dayjs from 'dayjs';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule,  ButtonModule, RouterLink],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.css']
})
export class MyBookingsComponent implements OnInit {
  private api = inject(SupabaseAgendaService);
  bookings = signal<ListedBooking[]>([]);
  isLoading = signal(true);
  errorLoading = signal<string | null>(null);

  async ngOnInit() {
    await this.loadBookings();
  }

  async loadBookings() {
    this.isLoading.set(true);
    this.errorLoading.set(null);
    try {
      const data = await this.api.getAllBookings();
      this.bookings.set(data);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      this.errorLoading.set('Falha ao carregar agendamentos. Tente novamente mais tarde.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async cancelBooking(booking: ListedBooking) {
    if (!booking.cancel_hash) {
      alert('Este agendamento não pode ser cancelado (hash de cancelamento ausente).');
      return;
    }
    // Adicionar uma confirmação do usuário
    if (confirm(`Tem certeza que deseja cancelar o agendamento para ${booking.cliente_nome} em ${new DatePipe('en-US').transform(booking.inicio, 'dd/MM/yyyy HH:mm')}?`)) {
      try {
        await this.api.cancelBooking(booking.id, booking.cancel_hash);
        alert('Agendamento cancelado com sucesso!');
        await this.loadBookings(); // Recarrega a lista
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
}
