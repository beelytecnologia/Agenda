  import { Component, OnInit, signal, inject } from '@angular/core';
  import { CommonModule }   from '@angular/common';
  import { FormsModule }    from '@angular/forms';
  import { ActivatedRoute } from '@angular/router';
  import dayjs from 'dayjs';
/* PrimeNG extra */
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';


  /* ─── PrimeNG ─────────────────────────────────────────────── */
  import { ButtonModule }   from 'primeng/button';
  import { TabViewModule }  from 'primeng/tabview';
  import { DialogModule }   from 'primeng/dialog';
  import { CalendarModule } from 'primeng/calendar';

  /* ─── Serviços & Tipos ─────────────────────────────────────── */
  import { SupabaseAgendaService,
          Filial, Profissional, Servico } from '../../../shared/services/supabase-agenda.service';

  type Cell = { date: Date | null; disabled: boolean };

  @Component({
    selector   : 'app-schedule',
    standalone : true,
    templateUrl: './schedule.component.html',
    styleUrls  : ['./schedule.component.css'],
    imports    : [
      /* Angular */   CommonModule, FormsModule,
      /* PrimeNG */   ButtonModule, TabViewModule, DialogModule, CalendarModule,
      InputTextModule, InputMaskModule
    ]
  })
  export class ScheduleComponent implements OnInit {

    /* ════════════════ ESTADO DE UI ═══════════════════════════ */
    view:'list'|'create' = 'list';
    tabIndex = 0;
    today            = new Date();
    maxDate          = dayjs().add(30, 'day').toDate();   // 30 dias p/ frente
    disabledWeekDays: number[] = [];
    clientePhone: string | null = null;
    readonly dayjs = dayjs;
    ocupados: string[] = [];     // preenchido por fetchOcupados()
    isSaving          = false;          // desabilita o botão enquanto grava
    successDlgVisible = false;          // mostra o “modal bonito” depois
    empresaSlug      = '';           // guarda o slug da rota
    nomeDlgVisible   = false;        // controla o novo diálogo
    clienteNome      = '';           // bind <input>
    clienteCPF       = '';

    filialDlgVisible = false;
    profDlgVisible   = false;
    servDlgVisible   = false;
    horaDlgVisible = false;
    ocupadosPorDia: Record<string, string[]> = {};

    ptBr = {
      firstDayOfWeek: 0,
      dayNames      : ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
      dayNamesShort : ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
      dayNamesMin   : ['Do','Se','Te','Qa','Qi','Sx','Sa'],
      monthNames    : ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      monthNamesShort: ['Jan','Fev','Mar','Abr','Mai','Jun',
                        'Jul','Ago','Set','Out','Nov','Dez'],
      today: 'Hoje', clear: 'Limpar'
    };
    tmpDate: Date | null = null;   // usado no [(ngModel)]

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
    weekdays = signal<string[]>([]);

    days: { date:Date; disabled:boolean }[] = [];
    horas: string[] = [];

    /* injeções */
    private api   = inject(SupabaseAgendaService);
    private route = inject(ActivatedRoute);

    /* ════════════════ CICLO DE VIDA ══════════════════════════ */
    async ngOnInit() {


      const slug = this.route.snapshot.paramMap.get('empresaSlug');
      this.clientePhone = this.route.snapshot.paramMap.get('fone'); // ← aqui  //  <-- aqui
      this.empresaSlug = slug ?? '';

      if (!slug) { console.error('Slug não informado'); return; }

      await this.loadEmpresa(slug);
      await this.loadOcupados();
    }
    private async loadOcupados() {
      const data = await this.fetchWebhookRaw();   // console.log já mostra

      /* <<< a resposta é [ { ...dias } ]  >>> */
      if (Array.isArray(data) && data.length === 1 && typeof data[0] === 'object') {
        this.ocupadosPorDia = data[0];            //  ✅ pega o objeto interno
      }
      else if (!Array.isArray(data)) {
        this.ocupadosPorDia = data;               // caso venha como objeto direto
      }
      else {
        // fallback se um dia voltar a ser “array de eventos”
        data.forEach((ev: any) => {
          const dia  = this.dayjs(ev.start.dateTime).format('YYYY-MM-DD');
          const hora = this.dayjs(ev.start.dateTime).format('HH:mm');
          (this.ocupadosPorDia[dia] ??= []).push(hora);
        });
      }

      console.log('[OCUPADOS] mapa dia→horas', this.ocupadosPorDia);
    }

    private getOcupadosDoDia(date: Date): string[] {
      const dia = this.dayjs(date).format('YYYY-MM-DD');
      return this.ocupadosPorDia[dia] ?? [];
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
    private generateDays(amount = 30): void {
      const prof = this.selectedProf();
      if (!prof) { this.days = []; return; }

      /* dias atendidos ------------------------------------------------ */
      const hp = this.parseHorariosPadrao((prof as any).horarios_padrao);
      const aceitos = new Set<number>();
      if (hp.diasUteis) [1,2,3,4,5].forEach(d => aceitos.add(d));
      if (hp.sabado)    aceitos.add(6);
      if (hp.domingo)   aceitos.add(0);

      /* monta o array de células -------------------------------------- */
      const hoje      = dayjs().startOf('day');
      const firstDate = hoje.toDate();
      const offset    = firstDate.getDay();          // 0-Dom … 6-Sáb

      const cells: Cell[] = [];

      /* espaços vazios até o primeiro dia (alinhamento) */
      for (let i = 0; i < offset; i++)
        cells.push({ date: null, disabled: true });

      /* próximos <amount> dias reais */
      for (let i = 0; i < amount; i++) {
        const d = hoje.add(i, 'day').toDate();
        cells.push({ date: d, disabled: !aceitos.has(d.getDay()) });
      }

      this.days = cells as unknown as { date: Date; disabled: boolean }[];
    }


    private generateHorarios(date: Date): void {
      const prof = this.selectedProf();
      if (!prof) { this.horas = []; return; }

      const hp   = this.parseHorariosPadrao((prof as any).horarios_padrao);
      const dow  = date.getDay();
      let faixa: [string, string] | undefined;

      if (dow >= 1 && dow <= 5) faixa = hp.diasUteis;
      else if (dow === 6)       faixa = hp.sabado;
      else if (dow === 0)       faixa = hp.domingo;
      if (!faixa) { this.horas = []; return; }

      const dur          = this.selectedServs()[0]?.duracao_min ?? 30;
      const [iniH, iniM] = faixa[0].split(':').map(Number);
      const [fimH, fimM] = faixa[1].split(':').map(Number);

      const start     = this.dayjs(date).hour(iniH).minute(iniM).second(0);
      const end       = this.dayjs(date).hour(fimH).minute(fimM).second(0);
      const lastStart = end.subtract(dur, 'minute');
      const ocupados  = this.getOcupadosDoDia(date);          // horas já bloqueadas

      const livres: string[] = [];
      for (let t = start; t.isSame(lastStart) || t.isBefore(lastStart); t = t.add(dur, 'minute')) {
        const hhmm = t.format('HH:mm');
        if (!ocupados.includes(hhmm)) livres.push(hhmm);
      }
      this.horas = livres;
    }

/** Retorna uma lista HH:mm já ocupada no dia selecionado */
private async fetchWebhookRaw(): Promise<any> {
  const res  = await fetch('https://n8n.grupobeely.com.br/webhook/get-events');
  const body = await res.json();
  console.log('[WEBHOOK] payload cru →', body);   // 👈 veja no DevTools
  return body;
}


/** abre o diálogo de data/horário sempre do passo-1 */
openHoraDlg(): void {
  this.selectedDate.set(null);
  this.selectedHora.set(null);
  this.horas = [];
  this.horaDlgVisible = true;
}


    /* ════════════════ EVENTOS DE SELEÇÃO ═════════════════════ */
    chooseFilial(f:Filial){
      this.selectedFilial.set(f);
      this.filialDlgVisible=false;
      this.selectedProf.set(null);     // força escolher prof de novo
    }

    chooseProf(p: Profissional) {
      this.selectedProf.set(p);
      this.profDlgVisible = false;

      /* define os dias do calendário que DEVEM ficar *desabilitados* */
      const hp           = this.parseHorariosPadrao((p as any).horarios_padrao);
      const diasAceitos  = new Set<number>();
      if (hp.diasUteis) diasAceitos.add(1).add(2).add(3).add(4).add(5);
      if (hp.sabado)    diasAceitos.add(6);
      if (hp.domingo)   diasAceitos.add(0);
      this.disabledWeekDays = [0,1,2,3,4,5,6].filter(d => !diasAceitos.has(d));
      this.generateDays(30);          // ← 30 dias
      /* limpeza de seleções antigas */
      this.selectedDate.set(null);
      this.selectedHora.set(null);
      this.horas = [];
    }
    onCalendarSelect(date: Date) {
      this.chooseDate(date);          // reaproveita a lógica já existente
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
  chooseDate(d: Date) {
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
      // ...existing code...
          this.days=[]; this.horas=[];
        }

/** Confirma o agendamento, enviando ao Supabase + Webhooks.
 *  Para o slug **dra-marcela-mendonca** exige nome completo e CPF
 *  (11 dígitos, sem máscara) antes de prosseguir. */
async confirm(): Promise<void> {
  /* evita cliques duplos ------------------------------------- */
  if (this.isSaving) return;

  /* ───────────────────────────────────────────────────────────
   * 1) Validação extra: nome/CPF obrigatórios p/ Marcela
   * ─────────────────────────────────────────────────────────── */
  if (this.empresaSlug === 'dra-marcela-mendonca' &&
      (!this.clienteNome?.trim() || this.clienteCPF?.length !== 11)) {
    this.nomeDlgVisible = true;          // abre diálogo “Nome / CPF”
    return;                              // aguarda usuário preencher
  }

  /* ───────────────────────────────────────────────────────────
   * 2) Validação dos campos obrigatórios já existentes
   * ─────────────────────────────────────────────────────────── */
  const dataSel       = this.selectedDate();
  const horaSel       = this.selectedHora();
  const servico       = this.selectedServs()[0];
  const filial        = this.selectedFilial();
  const profissional  = this.selectedProf();

  if (!dataSel || !horaSel || !servico || !filial || !profissional) {
    console.error('[CONFIRM] Dados de agendamento incompletos');
    return;
  }

  /* ───────────────────────────────────────────────────────────
   * 3) Monta payload e grava no Supabase
   * ─────────────────────────────────────────────────────────── */
  this.isSaving = true;

  try {
    /* horário ISO local -------------------------------------- */
    const [h, m] = horaSel.split(':').map(Number);
    const inicio = this.dayjs(dataSel).hour(h).minute(m).second(0);
    const fim    = inicio.add(servico.duracao_min, 'minute');

    /* telefone vindo da rota (fallback “000…”) ---------------- */
    const phone  = this.route.snapshot.paramMap.get('fone') ?? '00000000000';

    const bookingPayload = {
      filial_id      : filial.id,
      profissional_id: profissional.id,
      servico_id     : servico.id,
      inicio         : inicio.format('YYYY-MM-DDTHH:mm:ss'),
      cliente_nome   : this.clienteNome || 'Cliente Web',
      cliente_phone  : phone
    };

    /* grava no Supabase e recebe hashes de visualização -------- */
    const { id, view_hash, cancel_hash } =
          await this.api.createBooking(bookingPayload);

    /* ─────────────────────────────────────────────────────────
     * 4) Dispara webhooks (detalhado + links)
     * ───────────────────────────────────────────────────────── */
    const payloadDetalhado = {
      agendamento_id     : id,
      filial,
      profissional,
      servico,
      data_agenda        : inicio.format('YYYY-MM-DD'),
      horario_selecionado: horaSel,
      inicio             : inicio.format('YYYY-MM-DDTHH:mm:ss'),
      fim                : fim.format('YYYY-MM-DDTHH:mm:ss'),
      duracao_servico_min: servico.duracao_min,
      cliente            : {
        nome : bookingPayload.cliente_nome,
        telefone: phone,
        cpf  : this.clienteCPF
      },
      view_hash,
      cancel_hash,
      status             : 'confirmado'
    };

    /* webhook detalhado */
    await fetch(
      'https://n8n.grupobeely.com.br/webhook/0f9da9ee-0c0d-423d-98e8-607dc0a2cce9',
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payloadDetalhado) }
    );

    /* webhook com links */
    const base      = location.origin;
    await fetch(
      'https://n8n.grupobeely.com.br/webhook/teste-conan',
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          phone,
          view_url  : `${base}/meus-agendamentos/${view_hash}`,
          cancel_url: `${base}/meus-agendamentos/${cancel_hash}`
        }) }
    );

    /* ─────────────────── UI de sucesso ────────────────────── */
    this.backToList();
    this.successDlgVisible = true;

  } catch (err) {
    console.error('[CONFIRM] Falha ao criar agendamento:', err);
  } finally {
    this.isSaving = false;
  }
}

    /* ── agora o disabled inclui o flag isSaving ───────── */
    disabledAgendar(): boolean {
      return this.isSaving || !(
        this.selectedFilial() &&
        this.selectedProf()   &&
        this.selectedServs().length &&
        this.selectedDate()   &&
        this.selectedHora()
      );
    }
    onNomeDlgContinue() {
      if (this.clienteNome && this.clienteCPF?.length === 11) {
        this.nomeDlgVisible = false;
        this.confirm();              // chama de novo – agora passa na verificação
      }
    }

  }
