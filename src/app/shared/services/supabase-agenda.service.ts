
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../Environment/environment';
import dayjs from 'dayjs';

/* ─────────── Tipos auxiliares ─────────── */
export interface Empresa { id: string; slug: string; nome: string; }

export interface Endereco {
  rua?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; estado?: string; cep?: string;
}

export interface Filial       { id: string; nome: string; empresa_id: string; endereco?: Endereco; }
export interface Profissional { id: string; nome: string; filial_id: string; foto: string | null; }
export interface Servico      { id: string; nome: string; duracao_min: number; preco?: number; highlight?: boolean; }

export interface BookingPayload {
  filial_id      : string;
  profissional_id: string;
  servico_id     : string;
  inicio         : string;   // ISO
  cliente_nome   : string;
  cliente_phone  : string;
  cliente_cpf    : string;   // ← novo
  id_calendar?   : string | null; // opcional, pode ser preenchido depois
}

/* a lista usada em todos os SELECTs */
const SELECT_COLUMNS = `
  id,inicio,fim,cliente_nome,cliente_phone,cliente_cpf,status,cancel_hash,id_calendar,
  agend_filial!filial_id(nome),
  agend_profissional!profissional_id(nome),
  agend_servico!servico_id(nome,duracao_min)
`;

export interface ListedBooking {
  id           : string;
  inicio       : string;
  fim          : string;
  cliente_nome : string;
  cliente_phone: string;
  cliente_cpf  : string;
  cancel_hash  : string;
  id_calendar  : string | null; // integração Google Calendar
  status?      : 'pending' | 'confirmed' | 'cancelled';

  agend_filial      : { nome: string } | null;
  agend_profissional: { nome: string } | null;
  agend_servico     : { nome: string; duracao_min: number } | null;
}

/* ─────────────────────────────────────── */
@Injectable({ providedIn: 'root' })
export class SupabaseAgendaService {
  supabase: SupabaseClient;      // 👈  publique a instância

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  /* ========== 1. catálogo completo ========================= */
  async loadEmpresaComTudo(slug: string) {
    const { data, error } = await this.supabase
      .from('agend_empresa')
      .select(`
        *,
        agend_filial (
          *,
          agend_profissional (
            *,
            agend_servico ( id,nome,duracao_min,preco )
          )
        )
      `)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Empresa não encontrada');
    return data;
  }

  /* ========== 2. criar agendamento ========================= */
  async createBooking(p: BookingPayload) {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .insert({
        empresa_id      : await this.getEmpresaIdByFilial(p.filial_id),
        filial_id       : p.filial_id,
        profissional_id : p.profissional_id,
        servico_id      : p.servico_id,
        inicio          : p.inicio,
        fim             : dayjs(p.inicio)
                            .add(await this.somaDuracao(p.servico_id), 'minute')
                            .toISOString(),
        cliente_nome    : p.cliente_nome,
        cliente_phone   : p.cliente_phone,
        cliente_cpf     : p.cliente_cpf,
        id_calendar     : p.id_calendar ?? null
      })
      .select('id,view_hash,cancel_hash,id_calendar')
      .single();

    if (error) throw error;
    return data as { id: string; view_hash: string; cancel_hash: string; id_calendar: string | null };
  }

  /* ========== 3. detalhes via id + view_hash =============== */
  async getBooking(id: string, viewHash: string) {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .eq('view_hash', viewHash)
      .single();

    if (error) throw error;
    return data as unknown as ListedBooking;
  }

  /* ========== 4. consulta por hash (view ou cancel) ======== */
  async getBookingByHash(hash: string) {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .select(SELECT_COLUMNS)
      .or(`view_hash.eq.${hash},cancel_hash.eq.${hash}`)
      .maybeSingle();

    if (error) throw error;
    return data as ListedBooking | null;
  }

  /* ========== 5. lista por telefone ======================== */
  async getBookingsByPhone(phone: string) {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .select(SELECT_COLUMNS)
      .eq('cliente_phone', phone)
      .order('inicio', { ascending: true });

    if (error) throw error;

    /* Supabase retorna arrays quando há FKs com select() – normalizamos */
    return (data ?? []).map((r: any) => ({
      ...r,
      agend_filial      : Array.isArray(r.agend_filial)       ? r.agend_filial[0]       : r.agend_filial,
      agend_profissional: Array.isArray(r.agend_profissional) ? r.agend_profissional[0] : r.agend_profissional,
      agend_servico     : Array.isArray(r.agend_servico)      ? r.agend_servico[0]      : r.agend_servico,
    })) as ListedBooking[];
  }

  /* ========== 6. cancelar via RPC ========================== */
  async cancelBooking(id: string, hash: string) {
    const { error } = await this.supabase.rpc('agend_cancelar', { _id: id, _hash: hash });
    if (error) throw error;
    return true;
  }

  /* ===== helpers internos ================================== */
  private async getEmpresaIdByFilial(filialId: string) {
    const { data, error } = await this.supabase
      .from('agend_filial')
      .select('empresa_id')
      .eq('id', filialId)
      .single();

    if (error) throw error;
    return data!.empresa_id as string;
  }

  private async somaDuracao(servicoId: string) {
    const { data, error } = await this.supabase
      .from('agend_servico')
      .select('duracao_min')
      .eq('id', servicoId)
      .single();

    if (error) throw error;
    return data ? data.duracao_min : 0;
  }

  /* lista completa – opcional */
  async getAllBookings() {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .select(SELECT_COLUMNS)
      .order('inicio', { ascending: false });

    if (error) throw error;
    return data as unknown as ListedBooking[];
  }
}
