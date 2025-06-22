import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { FormsModule }    from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import dayjs              from 'dayjs';

/* ─── PrimeNG ─────────────────────────────────────────────── */
import { ButtonModule }   from 'primeng/button';
import { TabViewModule }  from 'primeng/tabview';
import { DialogModule }   from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';

/* ─── Serviços & Tipos ─────────────────────────────────────── */
import { SupabaseAgendaService,
         Filial, Profissional, Servico } from '../../../shared/services/supabase-agenda.service';

/*************************************************************************************************
 * ScheduleComponent – Interface pública de agendamento
 * · Gera dias / horas dinamicamente a partir de `horarios_padrao` (jsonb) de cada profissional
 * · Slots respeitam a duração do serviço selecionado
 * · Mantém toda a lógica de dialogs, confirmação e UI do seu código original
 *************************************************************************************************/
@Component({
  selector   : 'app-schedule',
  standalone : true,
  templateUrl: './schedule.component.html',
  styleUrls  : ['./schedule.component.css'],
  imports    : [
    /* Angular */   CommonModule, FormsModule,
    /* PrimeNG */   ButtonModule, TabViewModule, DialogModule, CalendarModule
  ]
})
export class ScheduleComponent implements OnInit {

  /* ════════════════ ESTADO DE UI ═══════════════════════════ */
  view:'list'|'create' = 'list';
  tabIndex = 0;

  /* dialogs */
  filialDlgVisible = false;
  profDlgVisible   = false;
  servDlgVisible   = false;
  horaDlgVisible   = false;

  /* listas reativas */
  filiais        = signal<Filial[]>([]);
  profissionais  = signal<Profissional[]>([]);
  servicos       = signal<Servico[]>([]);

  /* seleção atual */
  selectedFilial = signal<Filial|null>(null);
  selectedProf   = signal<Profissional|null>(null);
  selectedServs  = signal<Servico[]>([]);
  selectedDate   = signal<Date|null>(null);
  selectedHora   = signal<string|null>(null);

  /* dias/horas gerados */
  weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  days: { date:Date; disabled:boolean }[] = [];
  horas: string[] = [];

  /* injeções */
  private api   = inject(SupabaseAgendaService);
  private route = inject(ActivatedRoute);

  /* ════════════════ CICLO DE VIDA ══════════════════════════ */
  async ngOnInit(){
    const slug = this.route.snapshot.paramMap.get('empresaSlug');
    if(!slug){ console.error('Slug não informado'); return; }
    await this.loadEmpresa(slug);
  }

  /* ════════════════ CARREGAMENTO BASE ══════════════════════ */
  private async loadEmpresa(slug:string){
    const empresa:any = await this.api.loadEmpresaComTudo(slug);
    /* filiais e profissionais vêm aninhados ----------------- */
    this.filiais.set(empresa.agend_filial);
    const profs = empresa.agend_filial.flatMap((f:any)=>f.agend_profissional);
    this.profissionais.set(profs);
    /* serviços ficam pendurados em cada profissional -------- */
    const servs = profs.flatMap((p:any)=>p.agend_servico);
    this.servicos.set(servs);
  }

  /* ════════════════ HELPERS DE HORÁRIO ═════════════════════ */
  private parseHorariosPadrao(jsonStr:string|undefined|null){
    if(!jsonStr||jsonStr==='{}') return {} as any;
    try{ return JSON.parse(jsonStr); }catch{ return {}; }
  }

  /** Gera próximos 14 dias exibindo apenas os dias permitidos
   *  segundo `horarios_padrao`. */
  private generateDays(){
    const prof = this.selectedProf();
    if(!prof){ this.days=[]; return; }

    const hp = this.parseHorariosPadrao((prof as any).horarios_padrao);

    const diasAceitos = new Set<number>();
    if(hp.diasUteis)   diasAceitos.add(1).add(2).add(3).add(4).add(5);
    if(hp.sabado)      diasAceitos.add(6);
    if(hp.domingo)     diasAceitos.add(0);

    const hoje = new Date();
    const out: {date:Date; disabled:boolean}[] = [];
    for(let i=0;i<14;i++){
      const d = new Date(hoje); d.setDate(hoje.getDate()+i);
      const dow = d.getDay();                     // 0‑6
      out.push({ date:d, disabled: !diasAceitos.has(dow) });
    }
    this.days = out;
  }


private generateHorarios(date: Date): void {
  const prof = this.selectedProf();
  if (!prof) { this.horas = []; return; }

  const hp = this.parseHorariosPadrao((prof as any).horarios_padrao);

  /* faixa válida ------------------------------------------------- */
  const dow = date.getDay();                             // 0-Dom … 6-Sáb
  let faixa: [string, string] | undefined;
  if (dow >= 1 && dow <= 5) faixa = hp.diasUteis as [string,string];
  else if (dow === 6)       faixa = hp.sabado    as [string,string];
  else if (dow === 0)       faixa = hp.domingo   as [string,string];
  if (!faixa) { this.horas = []; return; }

  /* parâmetros --------------------------------------------------- */
  const dur = this.selectedServs()[0]?.duracao_min ?? 30;          // passo
  const [iniH, iniM] = faixa[0].split(':').map(Number);
  const [fimH, fimM] = faixa[1].split(':').map(Number);

  const start = dayjs(date).hour(iniH).minute(iniM).second(0);
  const end   = dayjs(date).hour(fimH).minute(fimM).second(0);

  /* gera enquanto o INÍCIO estiver antes (ou igual) ao fim -------- */
  const slots: string[] = [];
  for (let t = start; t.isSame(end) || t.isBefore(end); t = t.add(dur, 'minute')) {
    slots.push(t.format('HH:mm'));
  }
  this.horas = slots;

  /* debug -------------------------------------------------------- */
  console.log(`Faixa: ${faixa[0]} → ${faixa[1]} | Passo: ${dur} min`);
  console.log('Slots gerados:', slots);
}




  /* ════════════════ EVENTOS DE SELEÇÃO ═════════════════════ */
  chooseFilial(f:Filial){
    this.selectedFilial.set(f);
    this.filialDlgVisible=false;
    this.selectedProf.set(null);     // força escolher prof de novo
  }

  chooseProf(p:Profissional){
    this.selectedProf.set(p);
    this.profDlgVisible=false;
    /* gera dias permitidos p/ esse profissional */
    this.generateDays();
    this.selectedDate.set(null);
    this.selectedHora.set(null);
    this.horas=[];
  }
/* ════════════════ HELPERs usados no template ══════════════ */

/** ➜ Texto exibido no chip de serviços */
get servicosLabel(): string {
  return this.selectedServs().length
    ? this.selectedServs().map(s => s.nome).join(', ')
    : 'Selecione os serviços';
}

/** ➜ Soma de preços já formatada */
get totalPreco(): number {
  return this.selectedServs()
             .reduce((total, s) => total + (s.preco ?? 0), 0);
}

/** ➜ Lista de profissionais filtrada pela filial escolhida
 *     (é chamado no *ngFor* do diálogo de profissionais) */
profDaFilial(): Profissional[] {
  const f = this.selectedFilial();
  return this.profissionais()
             .filter(p => p.filial_id === f?.id);
}

  chooseDate(d:Date){
    this.selectedDate.set(d);
    this.generateHorarios(d);
  }

  chooseHora(h:string){ this.selectedHora.set(h); this.horaDlgVisible=false; }

  toggleServico(s:Servico){
    this.selectedServs.set([s]);
    /* se já havia data escolhida, regenera slots com nova duração */
    const d = this.selectedDate();
    if(d) this.generateHorarios(d);
    this.servDlgVisible=false;
  }

  isServicoSelected(s:Servico){ return this.selectedServs().some(v=>v.id===s.id); }

  /* ════════════════ NAVEGAÇÃO SIMPLES ══════════════════════ */
  openCreate(){ this.reset(); this.view='create'; }
  backToList(){ this.view='list'; }
  reset(){
    this.selectedFilial.set(null);
    this.selectedProf.set(null);
    this.selectedServs.set([]);
    this.selectedDate.set(null);
    this.selectedHora.set(null);
    this.days=[]; this.horas=[];
  }

  /* ════════════════ CONFIRMAÇÃO ════════════════════════════ */
  // A implementação original do seu método confirm() foi mantida 100% intacta.
  // Colei abaixo sem NENHUMA modificação!
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

  /* ════════════════ UTILIDADES ═════════════════════════════ */
  disabledAgendar(){
    return !(
      this.selectedFilial() &&
      this.selectedProf()   &&
      this.selectedServs().length &&
      this.selectedDate()   &&
      this.selectedHora()
    );
  }
}
