'use client';

import React, { useEffect, useState, useRef } from 'react';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import {
  Users,
  Crown,
  UserPlus,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit3,
  UserX,
  UserCheck,
  Sparkles,
} from 'lucide-react';

interface VereadorItem {
  id: number;
  nome: string;
  tratamento: 'Vereador' | 'Vereadora';
  isPresidente: boolean;
  isLicenciado: boolean;
}

export default function VereadoresPage() {
  const [vereadores, setVereadores] = useState<VereadorItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nomeNovo, setNomeNovo] = useState('');
  const [tratamentoNovo, setTratamentoNovo] = useState<'Vereador' | 'Vereadora'>('Vereador');

  // Estado OpenAI
  const [openaiConfigurada, setOpenaiConfigurada] = useState(false);
  const [openaiMascarada, setOpenaiMascarada] = useState('');
  const [chaveInput, setChaveInput] = useState('');
  const [testandoOpenai, setTestandoOpenai] = useState(false);
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  // Dialog nativo de edição (<dialog>)
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [editando, setEditando] = useState<VereadorItem | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editTratamento, setEditTratamento] = useState<'Vereador' | 'Vereadora'>('Vereador');

  async function carregarDados() {
    setCarregando(true);
    try {
      const res = await fetch('/api/vereadores');
      const data = await res.json();
      if (data.vereadores) {
        setVereadores(data.vereadores);
        setOpenaiConfigurada(Boolean(data.openaiConfigurada));
        setOpenaiMascarada(data.openaiMascarada || '');
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  async function handleAdicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeNovo.trim()) return;
    const res = await fetch('/api/vereadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'adicionar',
        nome: nomeNovo.trim(),
        tratamento: tratamentoNovo,
      }),
    });
    if (res.ok) {
      setNomeNovo('');
      setFeedback({
        tipo: 'sucesso',
        texto: `${tratamentoNovo} ${nomeNovo.trim()} cadastrado(a) com sucesso!`,
      });
      carregarDados();
    }
  }

  async function handleDefinirPresidente(id: number, nome: string) {
    const res = await fetch('/api/vereadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'definir_presidente', id }),
    });
    if (res.ok) {
      setFeedback({
        tipo: 'sucesso',
        texto: `${nome} definido(a) como Presidente da Câmara (posicionado por último na chamada).`,
      });
      carregarDados();
    }
  }

  async function handleAlternarLicenca(id: number) {
    const res = await fetch('/api/vereadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'alternar_licenca', id }),
    });
    if (res.ok) {
      carregarDados();
    }
  }

  async function handleExcluir(id: number, nome: string) {
    if (!window.confirm(`Tem certeza que deseja excluir ${nome}?`)) return;
    const res = await fetch('/api/vereadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir', id }),
    });
    if (res.ok) {
      setFeedback({ tipo: 'sucesso', texto: `${nome} removido(a).` });
      carregarDados();
    }
  }

  function abrirModalEdicao(v: VereadorItem) {
    setEditando(v);
    setEditNome(v.nome);
    setEditTratamento(v.tratamento);
    dialogRef.current?.showModal();
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const res = await fetch('/api/vereadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'editar',
        id: editando.id,
        nome: editNome,
        tratamento: editTratamento,
      }),
    });
    if (res.ok) {
      dialogRef.current?.close();
      setEditando(null);
      setFeedback({ tipo: 'sucesso', texto: 'Dados do parlamentar atualizados!' });
      carregarDados();
    }
  }

  async function handleSalvarOpenai(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/vereadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_openai', chave: chaveInput }),
    });
    if (res.ok) {
      setChaveInput('');
      setFeedback({
        tipo: 'sucesso',
        texto: 'Chave da OpenAI atualizada com segurança no servidor!',
      });
      carregarDados();
    }
  }

  async function handleTestarOpenai() {
    setTestandoOpenai(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/vereadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'testar_openai', chave: chaveInput }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({ tipo: 'sucesso', texto: data.message });
      } else {
        setFeedback({
          tipo: 'erro',
          texto: data.error || 'Falha ao validar chave na OpenAI.',
        });
      }
    } finally {
      setTestandoOpenai(false);
    }
  }

  const totalAtivos = vereadores.filter((v) => !v.isLicenciado).length;
  const quorumMinimo = Math.floor(totalAtivos / 2) + 1;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              <span>Cadastro de Vereadores & Inteligência Artificial</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Ordem alfabética regimental com o Presidente da Câmara posicionado por último.
              Quórum atual: <strong>{quorumMinimo} presentes</strong> (de {totalAtivos}{' '}
              ativos).
            </p>
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm font-bold ${
              feedback.tipo === 'sucesso'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.tipo === 'sucesso' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{feedback.texto}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs underline cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Adicionar Vereador */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <UserPlus className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-extrabold text-slate-900">
                Novo Parlamentar
              </h2>
            </div>

            <form onSubmit={handleAdicionar} className="space-y-4">
              <div>
                <label
                  htmlFor="tratamento-novo"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
                >
                  Tratamento Regimental
                </label>
                <select
                  id="tratamento-novo"
                  value={tratamentoNovo}
                  onChange={(e) =>
                    setTratamentoNovo(e.target.value as 'Vereador' | 'Vereadora')
                  }
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white font-semibold text-sm text-slate-900"
                >
                  <option value="Vereador">Vereador (Masculino)</option>
                  <option value="Vereadora">Vereadora (Feminino)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="nome-novo"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
                >
                  Nome Parlamentar (Chamada)
                </label>
                <input
                  id="nome-novo"
                  type="text"
                  required
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                  placeholder="Ex: Ademar, Jessica..."
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-300 font-medium text-sm text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Cadastrar Parlamentar</span>
              </button>
            </form>
          </section>

          {/* Card Chave OpenAI + TTS */}
          <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-violet-600" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Configuração da Inteligência Artificial (OpenAI GPT + Voz TTS)
                </h2>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  openaiConfigurada
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {openaiConfigurada
                    ? `Chave Ativa (${openaiMascarada})`
                    : 'Usando Voz Google (Sem Chave OpenAI)'}
                </span>
              </span>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              A chave da OpenAI (<code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">sk-...</code>) é utilizada para a <strong>Revisão em Lote de Leituras</strong> (limpeza de carimbos ICP-Brasil, conversão de tabelas orçamentárias e números por extenso) e para a <strong>Voz Neural da OpenAI</strong> no Teleprompter PDF. Caso não configurada, o sistema utiliza automaticamente a voz gratuita do Google.
            </p>

            <form onSubmit={handleSalvarOpenai} className="flex flex-col sm:flex-row gap-3 pt-1">
              <input
                type="password"
                value={chaveInput}
                onChange={(e) => setChaveInput(e.target.value)}
                placeholder="sk-proj-..."
                aria-label="Chave da API OpenAI"
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 font-mono text-sm text-slate-900"
              />
              <button
                type="submit"
                className="min-h-[48px] px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-all cursor-pointer shrink-0"
              >
                Salvar Chave
              </button>
              <button
                type="button"
                onClick={handleTestarOpenai}
                disabled={testandoOpenai}
                className="min-h-[48px] px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm transition-all cursor-pointer shrink-0"
              >
                {testandoOpenai ? 'Testando...' : 'Testar Conexão'}
              </button>
            </form>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
              <Crown className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Regra Regimental do Presidente:</strong> Nas deliberações, o voto
                do Presidente fica bloqueado por padrão (vota apenas em caso de empate),{' '}
                <strong>exceto em Projeto de Lei Complementar</strong>, onde seu voto é
                sempre habilitado.
              </span>
            </div>
          </section>
        </div>

        {/* Tabela de Vereadores */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900">
              Ordem de Chamada Regimental ({vereadores.length} parlamentares)
            </h2>
          </div>

          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Lista de Vereadores Cadastrados"
            tabIndex={0}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                  <th scope="col" className="py-3.5 px-6">
                    Ordem
                  </th>
                  <th scope="col" className="py-3.5 px-6">
                    Tratamento
                  </th>
                  <th scope="col" className="py-3.5 px-6">
                    Nome na Chamada
                  </th>
                  <th scope="col" className="py-3.5 px-6">
                    Status / Função
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                      Carregando vereadores...
                    </td>
                  </tr>
                ) : (
                  vereadores.map((v, idx) => (
                    <tr
                      key={v.id}
                      className={`transition-colors ${
                        v.isLicenciado
                          ? 'bg-slate-100/80 text-slate-400'
                          : v.isPresidente
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-4 px-6 font-bold tabular-nums text-slate-500">
                        {idx + 1}º
                      </td>
                      <td className="py-4 px-6 font-semibold">{v.tratamento}</td>
                      <td className="py-4 px-6 font-extrabold text-slate-900">
                        <span className={v.isLicenciado ? 'line-through text-slate-400' : ''}>
                          {v.nome}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {v.isPresidente && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                              <Crown className="w-3.5 h-3.5 text-amber-600" />
                              <span>Presidente da Câmara</span>
                            </span>
                          )}
                          {v.isLicenciado ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                              Licenciado (Inativo no Quórum)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Em Exercício
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {!v.isPresidente && (
                            <button
                              type="button"
                              onClick={() => handleDefinirPresidente(v.id, v.nome)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all cursor-pointer"
                              title="Definir como Presidente da Mesa Diretora"
                            >
                              <Crown className="w-3.5 h-3.5" />
                              <span>Tornar Presidente</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAlternarLicenca(v.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                          >
                            {v.isLicenciado ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Reativar</span>
                              </>
                            ) : (
                              <>
                                <UserX className="w-3.5 h-3.5 text-slate-500" />
                                <span>Licenciar</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirModalEdicao(v)}
                            className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all cursor-pointer"
                            title="Editar Parlamentar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExcluir(v.id, v.nome)}
                            className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer"
                            title="Excluir Parlamentar"
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

        {/* Modal Nativo <dialog> de Edição */}
        <dialog
          ref={dialogRef}
          aria-labelledby="dialog-editar-vereador-title"
          onClick={(e) => {
            if (e.target === dialogRef.current) dialogRef.current?.close();
          }}
          className="rounded-2xl p-0 backdrop:bg-slate-900/60 shadow-2xl border border-slate-200 w-full max-w-md m-auto"
        >
          <form onSubmit={salvarEdicao} className="p-6 space-y-4">
            <h3
              id="dialog-editar-vereador-title"
              className="text-lg font-extrabold text-slate-900"
            >
              Editar Parlamentar
            </h3>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Tratamento
              </label>
              <select
                value={editTratamento}
                onChange={(e) =>
                  setEditTratamento(e.target.value as 'Vereador' | 'Vereadora')
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm"
              >
                <option value="Vereador">Vereador</option>
                <option value="Vereadora">Vereadora</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Nome na Chamada
              </label>
              <input
                type="text"
                required
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </dialog>
      </main>
    </div>
  );
}
