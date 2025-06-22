import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { FormsModule }    from '@angular/forms';
import dayjs              from 'dayjs';

import { ButtonModule }   from 'primeng/button';
import { TabViewModule }  from 'primeng/tabview';
import { DialogModule }   from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';

import { ActivatedRoute }            from '@angular/router';
import { SupabaseAgendaService,
         Filial, Profissional, Servico } from '../../../shared/services/supabase-agenda.service';

@Component({
  selector    : 'app-schedule',
  standalone  : true,
  templateUrl : './schedule.component.html',
  styleUrls   : ['./schedule.component.css'],
  imports     : [
    CommonModule, FormsModule,
    ButtonModule, TabViewModule, DialogModule, CalendarModule
  ]
})
export class ScheduleComponent implements OnInit {
  weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];  days = this.generateDays();

  /* ---------- estado visual ---------- */
  view:'list'|'create' = 'list';
  tabIndex = 0;

  /* ---------- dialogs flags ---------- */
  filialDlgVisible = false;
  profDlgVisible   = false;
  servDlgVisible   = false;
  horaDlgVisible   = false;

  /* ---------- signals de dados ---------- */
  filiais        = signal<Filial[]>([]);
  profissionais  = signal<Profissional[]>([]);
  servicos       = signal<Servico[]>([]);

  selectedFilial = signal<Filial|null>(null);
  selectedProf   = signal<Profissional|null>(null);
  selectedServs  = signal<Servico[]>([]);
  selectedDate   = signal<Date|null>(null);
  selectedHora   = signal<string|null>(null);

  horas:   string[] = ['12:30', '16:00', '17:00', '18:00', '19:00'];
  dummy:Date|null = null;        // ngModel do <p-calendar>

  /* ---------- injeções ---------- */
  private api   = inject(SupabaseAgendaService);
  private route = inject(ActivatedRoute);

  /* ========== ciclo de vida ========== */
  async ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('empresaSlug') || 'teste-insano';
    await this.loadEmpresa(slug);
  }

  /* ========== carregamento Supabase ========== */
  private async loadEmpresa(slug:string){
    const empresa:any = await this.api.loadEmpresaComTudo(slug);

    /* separa dados */
    this.filiais.set(empresa.agend_filial);
    this.profissionais.set(
      empresa.agend_filial.flatMap((f:any)=>f.agend_profissional)
    );
    this.servicos.set(empresa.agend_servico);
  }

  /* ---------- auxiliares ---------- */
  profDaFilial(){
    const f = this.selectedFilial();
    return this.profissionais().filter(p=>p.filial_id===f?.id);
  }
  get servicosLabel(){
    return this.selectedServs().length
      ? this.selectedServs().map(s=>s.nome).join(', ')
      : 'Selecione os serviços';
  }
  get totalPreco(){
    return this.selectedServs().reduce((a, s) => a + (s.preco ?? 0), 0);
  }

   async chooseDate(d: Date) {
    this.selectedDate.set(d);

    this.horas = this.generateHorarios(d);

    console.log('Data selecionada:', d);
  }
  generateHorarios(date: Date): string[] {
    const horarios = [];
    const startHour = 9; // Horário inicial (9h)
    const endHour = 18; // Horário final (18h)
    const interval = 60; // Intervalo entre horários em minutos

    for (let hour = startHour; hour < endHour; hour++) {
      const time = new Date(date);
      time.setHours(hour, 0, 0, 0); // Define a hora e minutos
      horarios.push(`${time.getHours()}:00`);
    }

    return horarios;
  }
  async buscarHorarios(data:Date):Promise<string[]>{
    // TODO: substituir pelo seu RPC / view real
    const iso = dayjs(data).format('YYYY-MM-DD');
    const { data:slots, error } = await this.api['supabase']     // acesso direto
       .rpc('agend_horarios_disponiveis', { _date: iso });
    if(error){ console.error(error); return []; }
    return slots as string[];
  }
  chooseHora(h: string) {
    this.selectedHora.set(h);
    this.horaDlgVisible = false;
    console.log('Horário selecionado:', h);
  }

  chooseFilial(f:Filial){ this.selectedFilial.set(f); this.filialDlgVisible=false; }
    chooseProf(p: Profissional) {
      this.selectedProf.set(p);
      this.profDlgVisible = false;
      console.log('Profissional selecionado:', p);
    }

    toggleServico(s: Servico) {
      const currentSelected = this.selectedServs();
      // Verifica se o serviço clicado já é o único selecionado
      if (currentSelected.length === 1 && currentSelected[0].id === s.id) {
        this.selectedServs.set([]); // Desmarca o serviço
      } else {
        this.selectedServs.set([s]); // Define o serviço clicado como o único selecionado
      }
      // Opcional: fechar o diálogo de serviços após a seleção
      this.servDlgVisible = false;
    }
    isServicoSelected(s:Servico){ return this.selectedServs().some(v=>v.id===s.id); }

    /* ---------- navegação ---------- */
  // ...existing code...

  /* ---------- navegação ---------- */
  openCreate(){ this.reset(); this.view='create'; }
  backToList(){ this.view='list'; }
  reset(){
    this.selectedFilial.set(null);
    this.selectedProf.set(null);
    this.selectedServs.set([]);
    this.selectedDate.set(null);
    this.selectedHora.set(null);
    this.horas = [];
  }

  // ...existing code...
  // ...existing code...

    /* ---------- salvar agendamento ---------- */
    async confirm() {
      if (this.disabledAgendar()) return;

      const selectedDate = this.selectedDate()!;
      const selectedHora = this.selectedHora()!;
      const servicosSelecionados = this.selectedServs();

      if (servicosSelecionados.length === 0) {
        console.error("Nenhum serviço selecionado.");
        // Adicionar alguma notificação para o usuário aqui
        return;
      }
      if (servicosSelecionados.length > 1) {
        console.warn("Mais de um serviço selecionado, mas o sistema espera apenas um. Usando o primeiro.");
        // Considerar desabilitar a seleção de múltiplos serviços na UI (método toggleServico)
      }
      const servicoSelecionado = servicosSelecionados[0];

      const [hora, minuto] = selectedHora.split(':').map(Number);
      const inicioDateTime = dayjs(selectedDate).hour(hora).minute(minuto).second(0);
      const inicioISO = inicioDateTime.toISOString();

      // O cálculo de 'fim' e 'empresa_id' será feito pelo SupabaseAgendaService.createBooking

      // 1. Montar o payload para criar o agendamento no Supabase
      const bookingPayloadForSupabase = {
        filial_id: this.selectedFilial()!.id,
        profissional_id: this.selectedProf()!.id,
        servico_id: servicoSelecionado.id,
        inicio: inicioISO,
        cliente_nome: 'Cliente Web', // Tornar dinâmico se necessário
        cliente_phone: '5511999999999' // Tornar dinâmico se necessário
      };

      let bookingResult: { id: string; view_hash: string; cancel_hash: string; } | null = null;

      try {
        // 2. Chamar o serviço para criar o agendamento no Supabase
        bookingResult = await this.api.createBooking(bookingPayloadForSupabase);
        if (!bookingResult || !bookingResult.id) {
          throw new Error('Falha ao criar agendamento ou ID não retornado.');
        }
        console.log('Agendamento criado no Supabase:', bookingResult);
      } catch (error) {
        console.error('Erro ao criar agendamento no Supabase:', error);
        // Adicionar feedback para o usuário sobre o erro ao criar o agendamento
        return; // Interrompe a execução se a criação no Supabase falhar
      }

      // 3. Montar o payload para o webhook com os dados do agendamento criado
      // Incluindo o 'fim' que foi calculado e armazenado pelo Supabase (se o seu serviço o retornar)
      // ou recalcular aqui se necessário para o webhook.
      // Para este exemplo, vamos recalcular o 'fim' para o webhook,
      // assumindo que createBooking não retorna o 'fim'.
      const duracaoServicoMin = servicoSelecionado.duracao_min;
      const fimISO = inicioDateTime.add(duracaoServicoMin, 'minute').toISOString();

      const payloadWebhook = {
        agendamento_id: bookingResult.id, // ID do agendamento criado no Supabase
        filial: this.selectedFilial(), // Objeto completo da filial
        profissional: this.selectedProf(), // Objeto completo do profissional
        profissional_id: this.selectedProf()?.id,
        servico: servicoSelecionado, // Objeto completo do serviço
        servico_id: servicoSelecionado.id,
        data_agenda: dayjs(selectedDate).format('YYYY-MM-DD'),
        horario_selecionado: selectedHora,
        inicio: inicioISO,
        fim: fimISO, // Fim calculado para o webhook
        duracao_servico_min: duracaoServicoMin,
        cliente: {
          nome: bookingPayloadForSupabase.cliente_nome,
          telefone: bookingPayloadForSupabase.cliente_phone
        },
        view_hash: bookingResult.view_hash, // Hash retornado pelo Supabase
        cancel_hash: bookingResult.cancel_hash, // Hash retornado pelo Supabase
        status: 'confirmado' // Ou o status real retornado/definido pelo Supabase se disponível
      };

      try {
        // 4. Enviar os dados para o webhook
        await fetch('https://n8n.grupobeely.com.br/webhook/0f9da9ee-0c0d-423d-98e8-607dc0a2cce9', { // Use sua URL de webhook de produção
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadWebhook)
        });
        console.log('Webhook enviado com sucesso:', payloadWebhook);
        // Adicionar feedback para o usuário que o agendamento foi confirmado e notificação enviada
        this.backToList();
      } catch (error) {
        console.error('Erro ao enviar webhook:', error);
        // Informar ao usuário que o agendamento foi criado, mas houve um problema ao notificar.
        // O agendamento EXISTE no Supabase neste ponto.
        // Considerar uma lógica de retentativa para o webhook ou um status de "pendente de notificação".
        this.backToList(); // Ou manter na tela com uma mensagem específica
      }
    }

  disabledAgendar(){
    return !(
      this.selectedFilial() &&
      this.selectedProf()   &&
      this.selectedServs().length &&
      this.selectedDate()   &&
      this.selectedHora()
    );
  }
     generateDays() {
      const today = new Date();
      const days = [];
      const startDay = today.getDay(); // Dia da semana atual (0 = Domingo, 1 = Segunda, etc.)

      for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Domingo ou sábado
        days.push({ date, disabled: isWeekend });
      }

      // Reorganiza os dias da semana para começar no dia atual
      const reorderedWeekdays = [...this.weekdays.slice(startDay), ...this.weekdays.slice(0, startDay)];
      this.weekdays = reorderedWeekdays;

      return days;
    }
}
