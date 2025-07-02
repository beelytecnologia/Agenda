import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../Environment/environment';
import dayjs from 'dayjs';

export interface Empresa       { id:string; slug:string; nome:string }

export interface Endereco {
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
}

export interface Filial        { id:string; nome:string; empresa_id:string; endereco?: Endereco }
export interface Profissional  { id:string; nome:string; filial_id:string, foto:string|null }
export interface Servico       { id:string; nome:string; duracao_min:number, preco?:number,highlight?:boolean }

export interface BookingPayload {
  filial_id:        string;
  profissional_id:  string;
  servico_id:     string;
  inicio:           string;
  cliente_nome:     string;
  cliente_phone:    string;
}

export interface ListedBooking {
  id: string;
  inicio: string;
  fim: string;
  cliente_nome: string;
  cancel_hash: string;
  agend_filial: { nome: string } | null;
  agend_profissional: { nome: string } | null;
  agend_servico: { nome: string; duracao_min: number } | null;
}

@Injectable({ providedIn: 'root' })
export class SupabaseAgendaService {

  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  /* -----------------------------------------------------------
   * 1. Carrega tudo para o catálogo (1 única query)
   * ----------------------------------------------------------- */
  async loadEmpresaComTudo(slug: string) {
    const { data, error } = await this.supabase
    .from('agend_empresa')
    .select(`
      *,
      agend_filial (
        *,
        agend_profissional (
          *,
          agend_servico (
            id, nome, duracao_min, preco
          )
        )
      )
    `)
    .eq('slug', slug)
    .maybeSingle();


    if (error) throw error;
    if (!data) throw new Error('Empresa não encontrada.');
    return data;
  }


  /* -----------------------------------------------------------
   * 2. Cria agendamento e devolve hashes + id
   * ----------------------------------------------------------- */
    async createBooking(p: BookingPayload) {
      const { data, error } = await this.supabase
        .from('agend_agendamento')
        .insert({
          empresa_id:       await this.getEmpresaIdByFilial(p.filial_id),
          filial_id:        p.filial_id,
          profissional_id:  p.profissional_id,
          servico_id:     p.servico_id,
          inicio:           p.inicio,
          fim:              dayjs(p.inicio)
                             .add(await this.somaDuracao(p.servico_id), 'minute')
                             .toISOString(),
          cliente_nome:     p.cliente_nome,
          cliente_phone:    p.cliente_phone
        })
        .select('id, view_hash, cancel_hash')
        .single();

      if (error) throw error;
      return data as { id:string; view_hash:string; cancel_hash:string };
    }

  /* -----------------------------------------------------------
   * 3. Detalhes por id+view_hash
   * ----------------------------------------------------------- */
  async getBooking(id: string, viewHash: string) {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .select(`
        *,
        agend_filial!filial_id(id,nome),
        agend_profissional!profissional_id(id,nome),
        agend_servico!agend_agendamento_servicos_ids_fkey(id,nome,duracao_min)
      `)
      .eq('id', id)
      .eq('view_hash', viewHash)
      .single();

    if (error) throw error;
    return data;
  }

    /* -----------------------------------------------------------


      /* -----------------------------------------------------------
       * 5. Busca agendamento por hash (view ou cancel)
       * ----------------------------------------------------------- */
      async getBookingByHash(hash: string): Promise<ListedBooking | null> {
        console.log('[Service] Buscando pelo hash:', hash); // LOG 1

        const { data, error } = await this.supabase
          .from('agend_agendamento')
          .select(`
            id,
            inicio,
            fim,
            cliente_nome,
            cancel_hash,
            agend_filial!filial_id(nome),
            agend_profissional!profissional_id(nome),
            agend_servico!servico_id(nome, duracao_min)
          `)
          .or(`view_hash.eq.${hash},cancel_hash.eq.${hash}`)
          .maybeSingle();

        console.log('[Service] Resultado da busca:', { data, error }); // LOG 2

        if (error) {
          console.error('Erro ao buscar agendamento pelo hash:', error);
          throw error;
        }
        return data as ListedBooking | null;
      }


    /* ===== helpers internos ===== */
    private async getEmpresaIdByFilial(filialId: string) {
  // ...existing code...
    const { data, error } = await this.supabase
      .from('agend_filial')
      .select('empresa_id')
      .eq('id', filialId)
      .single();
    if (error) throw error;
    return data!.empresa_id as string;
  }

  async getAllBookings(): Promise<ListedBooking[]> {
    const { data, error } = await this.supabase
      .from('agend_agendamento')
      .select(`
        id,
        inicio,
        fim,
        cliente_nome,
        cancel_hash,
        agend_filial!filial_id(nome),
        agend_profissional!profissional_id(nome),
        agend_servico!servico_id(nome, duracao_min)
      `)
      .order('inicio', { ascending: false });

    if (error) {
      console.error('Erro ao buscar todos os agendamentos:', error);
      throw error;
    }
    return data as unknown as ListedBooking[];
  }

  private async somaDuracao(servicoId: string): Promise<number> {
    if (!servicoId) {
      return 0;
    }
    const { data, error } = await this.supabase
      .from('agend_servico')
      .select('duracao_min')
      .eq('id', servicoId)
      .single();

    if (error) {
      console.error('Erro ao buscar duração do serviço:', error);
      throw error;
    }
    return data ? data.duracao_min : 0;
  }

  async cancelBooking(id: string, cancelHash: string) {
    const { error } = await this.supabase
      .rpc('agend_cancelar', { _id: id, _hash: cancelHash });

    if (error) {
      console.error('Erro ao cancelar agendamento via RPC:', error);
      throw error;
    }
    return true;
  }
}
