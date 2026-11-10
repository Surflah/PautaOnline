'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import {
  FileSpreadsheet,
  PlusCircle,
  Sparkles,
  Printer,
  Trash2,
  CheckCircle2,
  Calendar,
  BookOpen,
} from 'lucide-react';

interface SessaoItem {
  id: number;
  nome: string;
  tipo: string;
  dataSessao: string;
  _count: {
    itens: number;
    votos: number;
  };
}

export default function SessoesPage() {
  const router = useRouter();
  const [sessoes, setSessoes] = useState<SessaoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nomeManual, setNomeManual] = useState('');
  const [tipoManual, setTipoManual] = useState('Ordinária');
  const [criando, setCriando] = useState(false);

  async function carregarSessoes() {
    setCarregando(true);
    try {
      const res = await fetch('/api/sessoes');
      const data = await res.json();
      if (data.sessoes) setSessoes(data.sessoes);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarSessoes();
  }, []);

  async function handleCriarManual(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeManual.trim()) return;
    setCriando(true);
    try {
      const res = await fetch('/api/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'criar',
          nome: nomeManual.trim(),
          tipo: tipoManual,
        }),
      });
      const data = await res.json();
      if (res.ok && data.sessao) {
        router.push(`/sessoes/${data.sessao.id}/pauta`);
      }
    } finally {
      setCriando(false);
    }
  }

  async function handleExcluirSessao(id: number, nome: string) {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir permanentemente a sessão "${nome}" e todos os seus itens?`
      )
    ) {
      return;
    }
    const res = await fetch('/api/sessoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir', id }),
    });
    if (res.ok) carregarSessoes();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-blue-600" />
              <span>Sessões Legislativas & Ordem do Dia</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Selecione uma sessão existente para gerenciar sua pauta ou crie uma nova
              sessão manualmente ou integrada ao SAPL.
            </p>
          </div>

          <Link
            href="/sessoes/montar-sapl"
            className="inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Sparkles className="w-5 h-5" />
            <span>Montar Pauta Completa do SAPL</span>
          </Link>
        </div>

        {/* Criação Manual de Sessão */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-blue-600" />
            <span>Criar Nova Sessão Manualmente</span>
          </h2>

          <form
            onSubmit={handleCriarManual}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
          >
            <div className="md:col-span-2">
              <label
                htmlFor="nome-sessao-manual"
                className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
              >
                Título Oficial da Sessão / Reunião
              </label>
              <input
                id="nome-sessao-manual"
                type="text"
                required
                value={nomeManual}
                onChange={(e) => setNomeManual(e.target.value)}
                placeholder="Ex: 35ª Reunião Ordinária da 2ª Sessão Legislativa da 10ª Legislatura"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-medium text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="tipo-sessao-manual"
                className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
              >
                Natureza da Reunião
              </label>
              <select
                id="tipo-sessao-manual"
                value={tipoManual}
                onChange={(e) => setTipoManual(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900"
              >
                <option value="Ordinária">Reunião Ordinária</option>
                <option value="Extraordinária">Reunião Extraordinária</option>
                <option value="Comissão">Reunião de Comissões</option>
                <option value="Solene">Sessão Solene</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={criando}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{criando ? 'Criando...' : 'Criar e Abrir Pauta'}</span>
            </button>
          </form>
        </section>

        {/* Lista de Sessões */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-extrabold text-slate-900">
                Sessões Cadastradas ({sessoes.length})
              </h2>
            </div>
          </div>

          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Lista de Sessões Cadastradas"
            tabIndex={0}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                  <th scope="col" className="py-3.5 px-6">
                    ID
                  </th>
                  <th scope="col" className="py-3.5 px-6">
                    Nome da Sessão
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-center">
                    Tipo
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-center">
                    Itens
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right">
                    Operações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      Carregando sessões...
                    </td>
                  </tr>
                ) : sessoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      Nenhuma sessão cadastrada. Crie uma sessão acima ou monte a pauta
                      pelo SAPL.
                    </td>
                  </tr>
                ) : (
                  sessoes.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-500 tabular-nums">
                        #{s.id}
                      </td>
                      <td className="py-4 px-6 font-extrabold text-slate-900">
                        {s.nome}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {s.tipo}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 tabular-nums">
                          {s._count.itens} itens
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/sessoes/${s.id}/pauta`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Editar Pauta</span>
                          </Link>
                          <Link
                            href={`/sessoes/${s.id}/roteiro`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Roteiro A4</span>
                          </Link>
                          <Link
                            href={`/sessoes/${s.id}/leitura`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Leitura IA</span>
                          </Link>
                          <Link
                            href={`/sessoes/${s.id}/deliberacao`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Deliberar</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleExcluirSessao(s.id, s.nome)}
                            className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer"
                            title="Excluir Sessão"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
