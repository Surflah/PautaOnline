'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import {
  Mic2,
  Save,
  Shuffle,
  RotateCcw,
  Ban,
  ArrowLeft,
  CheckCircle2,
  Play,
  Check,
} from 'lucide-react';

interface VereadorItem {
  id: number;
  nome: string;
  tratamento: string;
  isPresidente: boolean;
  isLicenciado: boolean;
}

interface PalavraLivreRegistro {
  vereadorId: number;
  vaiFalar: boolean;
  ordem: number;
  status: string; // 'aguardando' | 'falando' | 'concluido' | 'nao_inscrito'
}

interface SessaoResumo {
  id: number;
  nome: string;
  status: string;
}

function PalavraLivreConteudo() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessaoIdUrl = Number(searchParams.get('sessaoId') || 0);

  const [sessoes, setSessoes] = useState<SessaoResumo[]>([]);
  const [sessaoId, setSessaoId] = useState<number>(sessaoIdUrl);
  const [vereadores, setVereadores] = useState<VereadorItem[]>([]);
  const [inscritosIds, setInscritosIds] = useState<number[]>([]);
  const [registrosMap, setRegistrosMap] = useState<Record<number, PalavraLivreRegistro>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState('');

  const carregarDados = useCallback(async (idAlvo?: number) => {
    setCarregando(true);
    try {
      const q = idAlvo ? `?sessaoId=${idAlvo}` : '';
      const res = await fetch(`/api/palavra-livre${q}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) return;

      setSessoes(data.sessoes || []);
      if (data.sessaoAtiva) {
        setSessaoId(data.sessaoAtiva.id);
      }
      setVereadores(data.vereadores || []);

      const map: Record<number, PalavraLivreRegistro> = {};
      const ids: number[] = [];
      for (const r of data.registros || []) {
        map[r.vereadorId] = r;
        if (r.vaiFalar) ids.push(r.vereadorId);
      }
      setRegistrosMap(map);
      setInscritosIds(ids);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados(sessaoIdUrl || undefined);
  }, [sessaoIdUrl, carregarDados]);

  function alternarInscricao(verId: number) {
    setInscritosIds((prev) =>
      prev.includes(verId) ? prev.filter((id) => id !== verId) : [...prev, verId]
    );
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!sessaoId) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/palavra-livre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvar',
          sessaoId,
          inscritosIds,
        }),
      });
      if (res.ok) {
        setFeedback('Inscrições salvas com sucesso!');
        await carregarDados(sessaoId);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleSortearOrdem() {
    if (!sessaoId || inscritosIds.length === 0) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/palavra-livre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'sortear_ordem',
          sessaoId,
          inscritosIds,
        }),
      });
      if (res.ok) {
        setFeedback('Ordem de fala sorteada eletronicamente!');
        await carregarDados(sessaoId);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlterarStatus(verId: number, status: string) {
    if (!sessaoId) return;
    await fetch('/api/palavra-livre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'alterar_status',
        sessaoId,
        vereadorId: verId,
        status,
      }),
    });
    await carregarDados(sessaoId);
  }

  async function handleLimparTabela() {
    if (!sessaoId) return;
    if (!window.confirm('Deseja limpar todas as inscrições do Espaço Regimental?')) {
      return;
    }
    await fetch('/api/palavra-livre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'limpar', sessaoId }),
    });
    setFeedback('Tabela limpa.');
    await carregarDados(sessaoId);
  }

  async function handleFinalizarSessao() {
    if (!sessaoId) return;
    if (!window.confirm('Deseja declarar encerrada a presente sessão plenária?')) {
      return;
    }
    await fetch('/api/palavra-livre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'finalizar_sessao', sessaoId }),
    });
    router.push('/');
  }

  // Próximo vereador na fila para o texto regimental do Presidente
  const filaOrdenada = vereadores
    .filter((v) => registrosMap[v.id]?.vaiFalar)
    .sort((a, b) => (registrosMap[a.id]?.ordem || 99) - (registrosMap[b.id]?.ordem || 99));

  const oradorAtualOuProximo =
    filaOrdenada.find((v) => registrosMap[v.id]?.status === 'falando') ||
    filaOrdenada.find((v) => registrosMap[v.id]?.status === 'aguardando') ||
    null;

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <Mic2 className="w-8 h-8 text-amber-600" />
            <span>🗣️ Espaço Regimental (Palavra Livre)</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Controle de inscrição, sorteio e ordem de pronunciamento dos vereadores em
            plenário.
          </p>
        </div>

        <select
          aria-label="Selecionar Sessão Plenária"
          value={sessaoId}
          onChange={(e) => {
            const id = Number(e.target.value);
            setSessaoId(id);
            carregarDados(id);
          }}
          className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-sm text-slate-900 max-w-sm truncate"
        >
          {sessoes.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} — {s.nome}
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback('')}
            className="text-xs underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Texto Regimental de Abertura */}
      <div className="p-6 rounded-2xl bg-amber-50 border-l-8 border-amber-400 text-slate-900 text-xl sm:text-2xl font-medium text-center leading-relaxed shadow-xs">
        <strong>Antes de passarmos ao espaço regimental,</strong> algum vereador quer
        realizar a inscrição para uso da palavra?
      </div>

      {/* Tabela de Inscrição e Ordem */}
      <form
        onSubmit={handleSalvar}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Tabela de Inscrição no Espaço Regimental"
          tabIndex={0}
        >
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-[#0A2540] text-white text-sm sm:text-base font-extrabold uppercase">
                <th scope="col" className="py-4 px-6 text-left">
                  Vereador
                </th>
                <th scope="col" className="py-4 px-6">
                  Vai Falar?
                </th>
                <th scope="col" className="py-4 px-6">
                  Ordem / Status em Plenário
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-lg sm:text-xl">
              {carregando ? (
                <tr>
                  <td colSpan={3} className="py-10 text-slate-500 font-bold">
                    Carregando parlamentares...
                  </td>
                </tr>
              ) : (
                vereadores.map((v) => {
                  const marcado = inscritosIds.includes(v.id);
                  const reg = registrosMap[v.id];
                  const status = reg?.status || 'nao_inscrito';

                  return (
                    <tr
                      key={v.id}
                      className={`transition-colors ${
                        v.isLicenciado
                          ? 'bg-slate-100 text-slate-400 italic'
                          : status === 'falando'
                          ? 'bg-emerald-100/90 font-black'
                          : marcado
                          ? 'bg-emerald-50/50'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-5 px-6 text-left font-black uppercase tracking-wide text-slate-900">
                        {v.nome}
                        {v.isPresidente && (
                          <span className="ml-2 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 normal-case">
                            Presidente
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <button
                          type="button"
                          disabled={v.isLicenciado}
                          onClick={() => alternarInscricao(v.id)}
                          aria-label={`Inscrição de ${v.nome}`}
                          aria-pressed={marcado}
                          className={`w-11 h-11 rounded-full border-3 inline-flex items-center justify-center transition-all cursor-pointer ${
                            marcado
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-105'
                              : 'bg-white border-slate-400 text-transparent hover:border-slate-600'
                          }`}
                        >
                          <Check className="w-6 h-6 stroke-[3]" />
                        </button>
                      </td>

                      <td className="py-4 px-6">
                        {marcado && reg?.vaiFalar ? (
                          <div className="inline-flex flex-wrap items-center justify-center gap-2">
                            <span className="px-3 py-1 rounded-full bg-[#0A2540] text-white text-sm font-black tabular-nums">
                              {reg.ordem}º a falar
                            </span>

                            {status === 'aguardando' && (
                              <button
                                type="button"
                                onClick={() => handleAlterarStatus(v.id, 'falando')}
                                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>Conceder Palavra</span>
                              </button>
                            )}

                            {status === 'falando' && (
                              <button
                                type="button"
                                onClick={() => handleAlterarStatus(v.id, 'concluido')}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer animate-pulse"
                              >
                                <Mic2 className="w-3.5 h-3.5" />
                                <span>🎤 Falando (Concluir)</span>
                              </button>
                            )}

                            {status === 'concluido' && (
                              <span className="px-3 py-1 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold">
                                ✅ Pronunciamento Concluído
                              </span>
                            )}
                          </div>
                        ) : marcado ? (
                          <span className="text-sm font-bold text-amber-700">
                            Inscrito (Salve ou Sorteie)
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-center gap-4">
          <button
            type="submit"
            disabled={salvando}
            className="min-h-[52px] px-7 py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-700 text-white font-extrabold text-base shadow-md flex items-center gap-2 cursor-pointer transition-all"
          >
            <Save className="w-5 h-5" />
            <span>💾 Salvar Alterações</span>
          </button>

          <button
            type="button"
            disabled={salvando || inscritosIds.length === 0}
            onClick={handleSortearOrdem}
            className="min-h-[52px] px-7 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-extrabold text-base shadow-md flex items-center gap-2 cursor-pointer transition-all"
          >
            <Shuffle className="w-5 h-5" />
            <span>🎲 Sortear Ordem dos Inscritos</span>
          </button>

          <button
            type="button"
            onClick={handleLimparTabela}
            className="min-h-[52px] px-6 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-base shadow-xs flex items-center gap-2 cursor-pointer transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            <span>🧹 Limpar Tabela</span>
          </button>
        </div>
      </form>

      {/* Texto Regimental de Concessão da Palavra */}
      <div className="p-6 rounded-2xl bg-amber-50 border-l-8 border-amber-400 text-slate-900 text-xl sm:text-2xl font-medium text-center leading-relaxed shadow-xs">
        <strong>Passamos ao espaço regimental</strong> e, conforme inscrição prévia,
        concedo a palavra{' '}
        {oradorAtualOuProximo ? (
          <strong className="text-blue-900 underline">
            {oradorAtualOuProximo.tratamento === 'Vereadora'
              ? `à Vereadora ${oradorAtualOuProximo.nome}`
              : `ao Vereador ${oradorAtualOuProximo.nome}`}
          </strong>
        ) : (
          <span>ao vereador... (escolher ordem acima)</span>
        )}
        .
      </div>

      {/* Rodapé de Encerramento da Sessão */}
      <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={handleFinalizarSessao}
          className="min-h-[54px] px-8 py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-lg shadow-lg flex items-center gap-2.5 cursor-pointer transition-all"
        >
          <Ban className="w-5 h-5" />
          <span>🚫 Finalizar Sessão</span>
        </button>

        <Link
          href="/"
          className="min-h-[54px] px-8 py-4 rounded-2xl bg-slate-600 hover:bg-slate-700 text-white font-extrabold text-lg flex items-center gap-2.5 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>🔙 Voltar à Dashboard</span>
        </Link>
      </div>
    </main>
  );
}

export default function PalavraLivrePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <NavbarInstitucional />
      <Suspense
        fallback={
          <div className="p-12 text-center text-slate-500 font-bold">
            Carregando Espaço Regimental...
          </div>
        }
      >
        <PalavraLivreConteudo />
      </Suspense>
    </div>
  );
}
