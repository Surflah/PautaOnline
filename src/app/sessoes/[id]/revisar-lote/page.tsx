'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowLeft,
  BookOpen,
  RefreshCw,
  FileText,
} from 'lucide-react';

interface ItemFilaRevisao {
  id: number;
  numero: number;
  titulo: string;
  votacaoEtapa: string;
  votavel: boolean;
  pdfUrl: string | null;
  jaRevisado: boolean;
  elegivel: boolean;
  elegivelForcado: boolean;
  motivo: string;
}

export default function RevisarLotePage() {
  const params = useParams();
  const sessaoId = String(params.id || '');

  const [sessaoNome, setSessaoNome] = useState('');
  const [itens, setItens] = useState<ItemFilaRevisao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processandoLote, setProcessandoLote] = useState(false);
  const [feitosCount, setFeitosCount] = useState(0);
  const [totalFila, setTotalFila] = useState(0);
  const [statusPorItem, setStatusPorItem] = useState<
    Record<number, { texto: string; estado: 'fila' | 'processando' | 'ok' | 'erro' }>
  >({});

  const carregarFila = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/revisar-lote`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) return;

      setSessaoNome(data.sessao?.nome || '');
      const lista: ItemFilaRevisao[] = data.itens || [];
      setItens(lista);

      const elegiveis = lista.filter((i) => i.elegivel);
      setTotalFila(elegiveis.length);
      setFeitosCount(0);

      const mapaInicial: Record<
        number,
        { texto: string; estado: 'fila' | 'processando' | 'ok' | 'erro' }
      > = {};
      for (const it of lista) {
        if (it.elegivel) {
          mapaInicial[it.id] = { texto: 'Na fila', estado: 'fila' };
        } else if (it.jaRevisado) {
          mapaInicial[it.id] = { texto: '✓ Revisado', estado: 'ok' };
        }
      }
      setStatusPorItem(mapaInicial);
    } finally {
      setCarregando(false);
    }
  }, [sessaoId]);

  useEffect(() => {
    if (sessaoId) carregarFila();
  }, [sessaoId, carregarFila]);

  async function revisarItemIndividual(itemId: number): Promise<boolean> {
    setStatusPorItem((prev) => ({
      ...prev,
      [itemId]: { texto: 'Revisando com IA...', estado: 'processando' },
    }));

    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/revisar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pautaId: itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusPorItem((prev) => ({
          ...prev,
          [itemId]: {
            texto: `✗ ${data.error || 'Falhou'}`,
            estado: 'erro',
          },
        }));
        return false;
      }

      setStatusPorItem((prev) => ({
        ...prev,
        [itemId]: {
          texto: `✓ Revisado (${data.totalPaginas} págs)`,
          estado: 'ok',
        },
      }));
      return true;
    } catch {
      setStatusPorItem((prev) => ({
        ...prev,
        [itemId]: { texto: '✗ Erro de rede', estado: 'erro' },
      }));
      return false;
    }
  }

  async function handleRevisarLote() {
    const fila = itens.filter((i) => i.elegivel);
    if (fila.length === 0) return;

    setProcessandoLote(true);
    setFeitosCount(0);
    setTotalFila(fila.length);

    let concluidos = 0;
    for (const item of fila) {
      await revisarItemIndividual(item.id);
      concluidos++;
      setFeitosCount(concluidos);
    }

    setProcessandoLote(false);
    await carregarFila();
  }

  const pct = totalFila > 0 ? Math.round((feitosCount / totalFila) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              href={`/sessoes/${sessaoId}/pauta`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline mb-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Gerenciar Pauta</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-violet-600" />
              <span>Revisão de Leituras em Lote com IA</span>
            </h1>
            <p className="text-sm font-bold text-slate-600 mt-1">{sessaoNome}</p>
          </div>

          <Link
            href={`/sessoes/${sessaoId}/leitura`}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#0A2540] hover:bg-slate-800 text-white font-extrabold text-sm shadow-md transition-all"
          >
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span>Abrir Painel Pro de Leitura</span>
          </Link>
        </div>

        {/* Caixa de Explicação Regimental e Barra de Progresso */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
          <div className="p-4 rounded-2xl bg-violet-50 border border-violet-200 text-sm text-violet-950 leading-relaxed">
            <strong>Regra de Elegibilidade Automática:</strong> Entram na fila apenas os
            itens <strong>votáveis em Primeira ou Única Votação</strong> que possuam{' '}
            <strong>PDF anexado</strong> e ainda não tenham leitura revisada. Itens em{' '}
            <em>Segunda Votação</em> ficam de fora automaticamente porque já foram lidos na
            primeira votação. O texto revisado continua 100% editável no Painel Pro de
            Leitura.
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-slate-700">
              <span>
                {carregando
                  ? 'Analisando itens da pauta...'
                  : totalFila > 0
                  ? `${totalFila} item(ns) elegível(is) na fila (de ${itens.length} itens na pauta)`
                  : 'Todos os itens elegíveis desta sessão já estão com a leitura revisada!'}
              </span>
              <span className="tabular-nums text-violet-700 font-black">{pct}%</span>
            </div>

            <div className="w-full h-7 bg-slate-200 rounded-2xl overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={processandoLote || totalFila === 0}
              onClick={handleRevisarLote}
              className="min-h-[50px] px-7 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-extrabold text-base shadow-lg shadow-violet-600/20 flex items-center gap-2.5 cursor-pointer disabled:cursor-not-allowed transition-all"
            >
              <Play className="w-5 h-5" />
              <span>
                {processandoLote
                  ? `Revisando Lote (${feitosCount}/${totalFila})...`
                  : 'Revisar Todos os Itens da Fila'}
              </span>
            </button>
          </div>
        </section>

        {/* Lista de Itens da Pauta */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-3">
            Diagnóstico de Leitura por Item ({itens.length})
          </h2>

          <div className="space-y-3">
            {itens.map((item) => {
              const st = statusPorItem[item.id];
              const isOk = st?.estado === 'ok' || item.jaRevisado;
              const isErro = st?.estado === 'erro';
              const isProc = st?.estado === 'processando';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isOk
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : isErro
                      ? 'bg-red-50 border-red-300'
                      : item.elegivel
                      ? 'bg-white border-violet-300 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 opacity-75'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-base text-slate-900">
                        {item.numero}. {item.titulo}
                      </span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900">
                        {item.votavel ? item.votacaoEtapa : 'Rito / Leitura'}
                      </span>
                      {item.pdfUrl && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800">
                          <FileText className="w-3 h-3" />
                          <span>Com PDF</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-600">{item.motivo}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {st && (
                      <span
                        className={`text-xs font-extrabold px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${
                          isOk
                            ? 'bg-emerald-100 text-emerald-900'
                            : isErro
                            ? 'bg-red-100 text-red-800'
                            : isProc
                            ? 'bg-violet-100 text-violet-900 animate-pulse'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isOk && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {isErro && <AlertCircle className="w-4 h-4 text-red-600" />}
                        <span>{st.texto}</span>
                      </span>
                    )}

                    {item.elegivelForcado && !processandoLote && (
                      <button
                        type="button"
                        onClick={() => revisarItemIndividual(item.id)}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-violet-100 text-slate-700 hover:text-violet-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                        title="Revisar ou reprocessar este PDF individualmente"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{item.jaRevisado ? 'Reprocessar' : 'Revisar'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
