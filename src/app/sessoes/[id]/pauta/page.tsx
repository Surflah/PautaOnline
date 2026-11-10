'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import { TIPOS_MATERIA_OFICIAIS, ETAPAS_VOTACAO } from '@/core/regimento';
import {
  FileSpreadsheet,
  PlusCircle,
  Printer,
  Download,
  Globe,
  RotateCcw,
  FileText,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Upload,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface PautaItemRow {
  id: number;
  numero: number;
  titulo: string;
  ementa: string;
  tipoItem: string;
  autor: string;
  votacaoEtapa: string;
  votavel: boolean;
  pdfUrl: string | null;
  jaRevisado: boolean;
}

interface SessaoDetalhe {
  id: number;
  nome: string;
  tipo: string;
  itens: PautaItemRow[];
  _count: { votos: number; presencas: number };
}

interface OutraSessaoResumo {
  id: number;
  nome: string;
  _count: { itens: number };
}

interface SaplSessaoResumo {
  id: number;
  nome: string;
  dataInicio: string;
}

interface SaplOrdemDiaItem {
  numeroOrdem: number;
  materiaId: number;
  titulo: string;
  tipo: string;
  autor: string;
  isIndicacao: boolean;
}

export default function GerenciarPautaPage() {
  const params = useParams();
  const sessaoId = String(params.id || '');

  const [sessao, setSessao] = useState<SessaoDetalhe | null>(null);
  const [outrasSessoes, setOutrasSessoes] = useState<OutraSessaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [anuncioOrdem, setAnuncioOrdem] = useState('');
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  // Estado do Formulário de Cadastro / Edição de Item
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [numero, setNumero] = useState<number>(1);
  const [titulo, setTitulo] = useState('');
  const [ementa, setEmenta] = useState('');
  const [tipoItem, setTipoItem] = useState<string>('Projeto de Lei Ordinária');
  const [autor, setAutor] = useState('');
  const [votavel, setVotavel] = useState<'sim' | 'nao'>('sim');
  const [votacaoEtapa, setVotacaoEtapa] = useState<string>('Primeira Votação');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfAtualUrl, setPdfAtualUrl] = useState<string | null>(null);
  const [removerPdf, setRemoverPdf] = useState(false);
  const [salvandoItem, setSalvandoItem] = useState(false);

  // Drag-and-drop state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Modal Importar Local (<dialog>)
  const dialogLocalRef = useRef<HTMLDialogElement | null>(null);
  const [sessaoOrigemId, setSessaoOrigemId] = useState<number>(0);
  const [itensOrigemLocal, setItensOrigemLocal] = useState<PautaItemRow[]>([]);
  const [selecionadosLocalIds, setSelecionadosLocalIds] = useState<number[]>([]);
  const [importandoLocal, setImportandoLocal] = useState(false);

  // Modal Importar SAPL (<dialog>)
  const dialogSaplRef = useRef<HTMLDialogElement | null>(null);
  const [sessoesSapl, setSessoesSapl] = useState<SaplSessaoResumo[]>([]);
  const [saplSessaoSelId, setSaplSessaoSelId] = useState<number>(0);
  const [itensOrdemDiaSapl, setItensOrdemDiaSapl] = useState<SaplOrdemDiaItem[]>([]);
  const [selecionadosSaplIds, setSelecionadosSaplIds] = useState<number[]>([]);
  const [modoPdfSapl, setModoPdfSapl] = useState<'texto' | 'mesclado'>('texto');
  const [carregandoSaplItens, setCarregandoSaplItens] = useState(false);
  const [importandoSapl, setImportandoSapl] = useState(false);

  async function carregarPauta() {
    setCarregando(true);
    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/pauta`);
      const data = await res.json();
      if (data.sessao) {
        setSessao(data.sessao);
        setOutrasSessoes(data.outrasSessoes || []);
        if (!editItemId) {
          setNumero((data.sessao.itens?.length || 0) + 1);
        }
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (sessaoId) carregarPauta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId]);

  function limparFormulario(proximoNum?: number) {
    setEditItemId(null);
    setNumero(proximoNum ?? (sessao?.itens.length || 0) + 1);
    setTitulo('');
    setEmenta('');
    setTipoItem('Projeto de Lei Ordinária');
    setAutor('');
    setVotavel('sim');
    setVotacaoEtapa('Primeira Votação');
    setPdfFile(null);
    setPdfAtualUrl(null);
    setRemoverPdf(false);
  }

  function iniciarEdicaoItem(item: PautaItemRow) {
    setEditItemId(item.id);
    setNumero(item.numero);
    setTitulo(item.titulo);
    setEmenta(item.ementa || '');
    setTipoItem(item.tipoItem || 'Projeto de Lei Ordinária');
    setAutor(item.autor || '');
    setVotavel(item.votavel ? 'sim' : 'nao');
    setVotacaoEtapa(item.votacaoEtapa || 'Primeira Votação');
    setPdfAtualUrl(item.pdfUrl);
    setPdfFile(null);
    setRemoverPdf(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSalvarItem(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSalvandoItem(true);

    try {
      const fd = new FormData();
      if (editItemId) fd.append('itemId', String(editItemId));
      fd.append('numero', String(numero));
      fd.append('titulo', titulo.trim());
      fd.append('ementa', ementa);
      fd.append('tipoItem', tipoItem);
      fd.append('autor', autor.trim());
      fd.append('votavel', votavel);
      fd.append('votacaoEtapa', votavel === 'sim' ? votacaoEtapa : 'Não Votável');
      fd.append('removerPdf', String(removerPdf));
      if (pdfFile) fd.append('pdfAnexo', pdfFile);

      const res = await fetch(`/api/sessoes/${sessaoId}/pauta`, {
        method: 'POST',
        body: fd,
      });

      if (res.ok) {
        setFeedback({
          tipo: 'sucesso',
          texto: editItemId
            ? 'Item da pauta atualizado com sucesso!'
            : 'Novo item adicionado à pauta!',
        });
        await carregarPauta();
        limparFormulario((sessao?.itens.length || 0) + (editItemId ? 1 : 2));
      } else {
        const err = await res.json();
        setFeedback({ tipo: 'erro', texto: err.error || 'Erro ao salvar item.' });
      }
    } finally {
      setSalvandoItem(false);
    }
  }

  async function handleExcluirItem(item: PautaItemRow) {
    if (!window.confirm(`Deseja excluir o item "${item.numero}. ${item.titulo}"?`)) {
      return;
    }
    const res = await fetch(`/api/sessoes/${sessaoId}/pauta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir_item', itemId: item.id }),
    });
    if (res.ok) {
      setFeedback({ tipo: 'sucesso', texto: `Item "${item.titulo}" removido.` });
      carregarPauta();
    }
  }

  async function salvarNovaOrdem(novaLista: PautaItemRow[], mensagemAnuncio: string) {
    if (!sessao) return;
    const renumerados = novaLista.map((it, idx) => ({ ...it, numero: idx + 1 }));
    setSessao({ ...sessao, itens: renumerados });
    setAnuncioOrdem(mensagemAnuncio);

    await fetch(`/api/sessoes/${sessaoId}/pauta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'reordenar',
        ids: renumerados.map((i) => i.id),
      }),
    });
  }

  function moverItem(idxAtual: number, direcao: -1 | 1) {
    if (!sessao) return;
    const novoIdx = idxAtual + direcao;
    if (novoIdx < 0 || novoIdx >= sessao.itens.length) return;
    const copia = [...sessao.itens];
    const [movido] = copia.splice(idxAtual, 1);
    copia.splice(novoIdx, 0, movido);
    salvarNovaOrdem(
      copia,
      `${movido.titulo} movido para a posição ${novoIdx + 1} de ${copia.length}.`
    );
  }

  function handleDropRow(targetIdx: number) {
    if (draggedIdx === null || draggedIdx === targetIdx || !sessao) {
      setDraggedIdx(null);
      return;
    }
    const copia = [...sessao.itens];
    const [movido] = copia.splice(draggedIdx, 1);
    copia.splice(targetIdx, 0, movido);
    setDraggedIdx(null);
    salvarNovaOrdem(
      copia,
      `${movido.titulo} reposicionado na ordem ${targetIdx + 1} de ${copia.length}.`
    );
  }

  async function handleZerarVotos() {
    if (
      !window.confirm(
        'Tem certeza que deseja zerar todas as votações e chamadas desta sessão? Os itens da pauta serão mantidos.'
      )
    ) {
      return;
    }
    const res = await fetch(`/api/sessoes/${sessaoId}/pauta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'zerar_votos' }),
    });
    if (res.ok) {
      setFeedback({
        tipo: 'sucesso',
        texto: 'Todas as votações e presenças desta sessão foram reiniciadas!',
      });
      carregarPauta();
    }
  }

  // Funções Modal Importar de Outra Sessão Local
  async function abrirModalImportarLocal() {
    dialogLocalRef.current?.showModal();
    if (outrasSessoes.length > 0) {
      const primeiraId = outrasSessoes[0].id;
      setSessaoOrigemId(primeiraId);
      await carregarItensSessaoOrigem(primeiraId);
    }
  }

  async function carregarItensSessaoOrigem(idOrigem: number) {
    if (!idOrigem) return;
    const res = await fetch(`/api/sessoes/${idOrigem}/pauta`);
    const data = await res.json();
    const lista: PautaItemRow[] = data.sessao?.itens || [];
    setItensOrigemLocal(lista);
    setSelecionadosLocalIds(lista.map((x) => x.id));
  }

  async function confirmarImportacaoLocal(e: React.FormEvent) {
    e.preventDefault();
    if (selecionadosLocalIds.length === 0) return;
    setImportandoLocal(true);
    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/pauta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'importar_local',
          pautaIds: selecionadosLocalIds,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        dialogLocalRef.current?.close();
        setFeedback({
          tipo: 'sucesso',
          texto: `${data.importados} itens importados com sucesso!`,
        });
        carregarPauta();
      }
    } finally {
      setImportandoLocal(false);
    }
  }

  // Funções Modal Importar do SAPL
  async function abrirModalImportarSapl() {
    dialogSaplRef.current?.showModal();
    if (sessoesSapl.length === 0) {
      setCarregandoSaplItens(true);
      try {
        const res = await fetch('/api/sapl?acao=sessoes');
        const data = await res.json();
        if (data.sessoes && data.sessoes.length > 0) {
          setSessoesSapl(data.sessoes);
          const primeira = data.sessoes[0].id;
          setSaplSessaoSelId(primeira);
          await carregarOrdemDiaSaplModal(primeira);
        }
      } finally {
        setCarregandoSaplItens(false);
      }
    }
  }

  async function carregarOrdemDiaSaplModal(idSapl: number) {
    setCarregandoSaplItens(true);
    try {
      const res = await fetch(`/api/sapl?acao=ordem_do_dia&sessaoId=${idSapl}`);
      const data = await res.json();
      const lista: SaplOrdemDiaItem[] = data.itens || [];
      setItensOrdemDiaSapl(lista);
      setSelecionadosSaplIds(lista.map((m) => m.materiaId));
    } finally {
      setCarregandoSaplItens(false);
    }
  }

  async function confirmarImportacaoSapl(e: React.FormEvent) {
    e.preventDefault();
    if (selecionadosSaplIds.length === 0) return;
    setImportandoSapl(true);
    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/pauta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'importar_sapl',
          saplSessaoId: saplSessaoSelId,
          materiaIds: selecionadosSaplIds,
          modoPdf: modoPdfSapl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        dialogSaplRef.current?.close();
        setFeedback({
          tipo: 'sucesso',
          texto: `${data.importados} itens importados do SAPL (Indicações agrupadas automaticamente)!`,
        });
        carregarPauta();
      }
    } finally {
      setImportandoSapl(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />

      {/* Live region acessível para leitores de tela ao reordenar itens */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {anuncioOrdem}
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Cabeçalho e Barra de Ferramentas */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <Link
              href="/sessoes"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline mb-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Lista de Sessões</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-blue-600 shrink-0" />
              <span>{sessao ? sessao.nome : `Carregando Sessão #${sessaoId}...`}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/sessoes/${sessaoId}/deliberacao`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Iniciar Deliberação</span>
            </Link>

            <Link
              href={`/sessoes/${sessaoId}/leitura`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A2540] hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all"
            >
              <BookOpen className="w-4 h-4 text-blue-300" />
              <span>Painel Pro de Leitura</span>
            </Link>

            <Link
              href={`/sessoes/${sessaoId}/revisar-lote`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Revisar Leituras IA</span>
            </Link>

            <Link
              href={`/sessoes/${sessaoId}/roteiro`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold shadow-xs transition-all"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>Gerar Roteiro A4</span>
            </Link>

            <button
              type="button"
              onClick={abrirModalImportarLocal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Importar de Outra Sessão</span>
            </button>

            <button
              type="button"
              onClick={abrirModalImportarSapl}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              <span>Importar Ordem do Dia SAPL</span>
            </button>

            <button
              type="button"
              onClick={handleZerarVotos}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs sm:text-sm font-bold transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-amber-700" />
              <span>Zerar Votações</span>
            </button>
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

        {/* Formulário de Cadastro / Edição de Item */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              {editItemId ? (
                <>
                  <Edit3 className="w-5 h-5 text-amber-600" />
                  <span>Editando Item #{numero} da Pauta</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-5 h-5 text-blue-600" />
                  <span>Adicionar Novo Item à Pauta</span>
                </>
              )}
            </h2>
            {editItemId && (
              <button
                type="button"
                onClick={() => limparFormulario()}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Cancelar Edição
              </button>
            )}
          </div>

          <form onSubmit={handleSalvarItem} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div>
                <label
                  htmlFor="item-numero"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1"
                >
                  Ordem Nº
                </label>
                <input
                  id="item-numero"
                  type="number"
                  min={1}
                  required
                  value={numero}
                  onChange={(e) => setNumero(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-sm tabular-nums"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="item-titulo"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1"
                >
                  Título da Matéria / Item do Rito
                </label>
                <input
                  id="item-titulo"
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Projeto de Lei Ordinária nº 71 de 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="item-tipo"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1"
                >
                  Tipo Regimental
                </label>
                <select
                  id="item-tipo"
                  value={tipoItem}
                  onChange={(e) => setTipoItem(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm"
                >
                  {TIPOS_MATERIA_OFICIAIS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="item-autor"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1"
                >
                  Autoria (Separar por vírgulas)
                </label>
                <input
                  id="item-autor"
                  type="text"
                  value={autor}
                  onChange={(e) => setAutor(e.target.value)}
                  placeholder="Ex: Poder Executivo, Vereadora Marta..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="item-votavel"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1"
                >
                  Item Votável em Plenário?
                </label>
                <select
                  id="item-votavel"
                  value={votavel}
                  onChange={(e) => setVotavel(e.target.value as 'sim' | 'nao')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm"
                >
                  <option value="sim">Sim — Sujeito à Deliberação/Votação</option>
                  <option value="nao">Não — Apenas Leitura / Rito / Chamada</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="item-etapa"
                  className="block text-xs font-bold uppercase text-slate-600 mb-1"
                >
                  Turno / Etapa de Votação
                </label>
                <select
                  id="item-etapa"
                  disabled={votavel === 'nao'}
                  value={votacaoEtapa}
                  onChange={(e) => setVotacaoEtapa(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 font-semibold text-sm"
                >
                  {ETAPAS_VOTACAO.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="item-ementa"
                className="block text-xs font-bold uppercase text-slate-600 mb-1"
              >
                Ementa / Texto do Roteiro da Presidência (Use [CHAMADA] para abrir tabela
                de presença)
              </label>
              <textarea
                id="item-ementa"
                rows={3}
                value={ementa}
                onChange={(e) => setEmenta(e.target.value)}
                placeholder="Digite a ementa da proposição ou a fala regimental do Presidente..."
                className="w-full p-3.5 rounded-xl border border-slate-300 text-sm font-medium leading-relaxed"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer transition-all">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>
                    {pdfFile ? pdfFile.name : 'Anexar Documento PDF (Teleprompter)'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) =>
                      setPdfFile(e.target.files?.[0] ? e.target.files[0] : null)
                    }
                    className="hidden"
                  />
                </label>

                {pdfAtualUrl && !removerPdf && (
                  <div className="flex items-center gap-2 text-xs">
                    <a
                      href={pdfAtualUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF Atual Anexado</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setRemoverPdf(true)}
                      className="text-red-600 font-bold hover:underline cursor-pointer"
                    >
                      (Remover PDF)
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={salvandoItem}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>
                  {salvandoItem
                    ? 'Salvando...'
                    : editItemId
                    ? 'Salvar Alterações no Item'
                    : 'Adicionar Item na Pauta'}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* Tabela de Itens da Pauta com Drag-and-Drop e Controles Acessíveis */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Sequência da Pauta ({sessao?.itens.length || 0} itens)
              </h2>
              <p className="text-xs text-slate-500">
                Arraste as linhas ou utilize as setas ↑ ↓ para reordenar os itens em tempo
                real.
              </p>
            </div>
          </div>

          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Itens da Pauta Legislativa"
            tabIndex={0}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                  <th scope="col" className="py-3.5 px-4 w-28">
                    Ordem
                  </th>
                  <th scope="col" className="py-3.5 px-4">
                    Matéria / Ementa
                  </th>
                  <th scope="col" className="py-3.5 px-4">
                    Autoria / Tipo
                  </th>
                  <th scope="col" className="py-3.5 px-4 text-center">
                    Etapa
                  </th>
                  <th scope="col" className="py-3.5 px-4 text-center">
                    Anexo PDF
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {carregando ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      Carregando itens da pauta...
                    </td>
                  </tr>
                ) : !sessao || sessao.itens.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      Nenhum item cadastrado nesta sessão. Adicione manualmente acima ou
                      importe do SAPL.
                    </td>
                  </tr>
                ) : (
                  sessao.itens.map((item, idx) => (
                    <tr
                      key={item.id}
                      draggable
                      onDragStart={() => setDraggedIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropRow(idx)}
                      className={`transition-colors ${
                        draggedIdx === idx
                          ? 'opacity-50 bg-blue-50'
                          : item.votavel
                          ? 'hover:bg-blue-50/30'
                          : 'bg-slate-50/40 hover:bg-slate-100/60'
                      }`}
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <GripVertical
                            className="w-4 h-4 text-slate-400 cursor-grab shrink-0"
                            aria-hidden="true"
                          />
                          <span className="w-7 h-7 rounded-lg bg-[#0A2540] text-white font-extrabold text-xs flex items-center justify-center tabular-nums">
                            {item.numero}
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moverItem(idx, -1)}
                              aria-label={`Mover ${item.titulo} para cima`}
                              className="p-0.5 text-slate-500 hover:text-blue-600 disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === sessao.itens.length - 1}
                              onClick={() => moverItem(idx, 1)}
                              aria-label={`Mover ${item.titulo} para baixo`}
                              className="p-0.5 text-slate-500 hover:text-blue-600 disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 max-w-md">
                        <p className="font-extrabold text-slate-900">{item.titulo}</p>
                        {item.ementa && (
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2 whitespace-pre-line">
                            {item.ementa}
                          </p>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <p className="text-xs font-bold text-slate-800">
                          {item.autor || '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {item.tipoItem}
                        </p>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.votavel
                              ? item.tipoItem.includes('Complementar')
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-200/80 text-slate-700'
                          }`}
                        >
                          {item.votavel ? item.votacaoEtapa : 'Não Votável'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        {item.pdfUrl ? (
                          <a
                            href={item.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition-all"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Abrir PDF</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => iniciarEdicaoItem(item)}
                            className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all cursor-pointer"
                            title="Editar Item"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExcluirItem(item)}
                            className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer"
                            title="Excluir Item"
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

        {/* Modal <dialog> Importar de Outra Sessão Local */}
        <dialog
          ref={dialogLocalRef}
          aria-labelledby="modal-importar-local-title"
          onClick={(e) => {
            if (e.target === dialogLocalRef.current) dialogLocalRef.current?.close();
          }}
          className="rounded-2xl p-0 backdrop:bg-slate-900/60 shadow-2xl border border-slate-200 w-full max-w-2xl m-auto"
        >
          <form onSubmit={confirmarImportacaoLocal} className="p-6 space-y-4">
            <h3
              id="modal-importar-local-title"
              className="text-lg font-extrabold text-slate-900"
            >
              Importar Itens de Outra Sessão Cadastrada
            </h3>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Selecione a Sessão de Origem
              </label>
              <select
                value={sessaoOrigemId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSessaoOrigemId(id);
                  carregarItensSessaoOrigem(id);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm"
              >
                {outrasSessoes.map((os) => (
                  <option key={os.id} value={os.id}>
                    #{os.id} — {os.nome} ({os._count.itens} itens)
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {itensOrigemLocal.map((it) => {
                const checked = selecionadosLocalIds.includes(it.id);
                return (
                  <label
                    key={it.id}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelecionadosLocalIds((prev) =>
                          checked ? prev.filter((x) => x !== it.id) : [...prev, it.id]
                        );
                      }}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                    <span className="font-bold text-slate-900">
                      {it.numero}. {it.titulo}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => dialogLocalRef.current?.close()}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={importandoLocal || selecionadosLocalIds.length === 0}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer"
              >
                {importandoLocal
                  ? 'Importando...'
                  : `Importar (${selecionadosLocalIds.length}) Selecionados`}
              </button>
            </div>
          </form>
        </dialog>

        {/* Modal <dialog> Importar Ordem do Dia do SAPL */}
        <dialog
          ref={dialogSaplRef}
          aria-labelledby="modal-importar-sapl-title"
          onClick={(e) => {
            if (e.target === dialogSaplRef.current) dialogSaplRef.current?.close();
          }}
          className="rounded-2xl p-0 backdrop:bg-slate-900/60 shadow-2xl border border-slate-200 w-full max-w-2xl m-auto"
        >
          <form onSubmit={confirmarImportacaoSapl} className="p-6 space-y-4">
            <h3
              id="modal-importar-sapl-title"
              className="text-lg font-extrabold text-slate-900"
            >
              Importar Matérias da Ordem do Dia do SAPL
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Sessão no SAPL
                </label>
                <select
                  value={saplSessaoSelId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSaplSessaoSelId(id);
                    carregarOrdemDiaSaplModal(id);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm"
                >
                  {sessoesSapl.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.dataInicio}] {s.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Modo de Download de PDF
                </label>
                <select
                  value={modoPdfSapl}
                  onChange={(e) =>
                    setModoPdfSapl(e.target.value as 'texto' | 'mesclado')
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-sm"
                >
                  <option value="texto">Apenas Texto Original (Ordinária)</option>
                  <option value="mesclado">Mesclar Pareceres/Acessórios (Comissões)</option>
                </select>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {carregandoSaplItens ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  Consultando Ordem do Dia no SAPL...
                </p>
              ) : (
                itensOrdemDiaSapl.map((m) => {
                  const checked = selecionadosSaplIds.includes(m.materiaId);
                  return (
                    <label
                      key={m.materiaId}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 cursor-pointer text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelecionadosSaplIds((prev) =>
                              checked
                                ? prev.filter((x) => x !== m.materiaId)
                                : [...prev, m.materiaId]
                            );
                          }}
                          className="w-4 h-4 accent-indigo-600 rounded"
                        />
                        <div>
                          <p className="font-bold text-slate-900">
                            {m.numeroOrdem}. {m.titulo}
                          </p>
                          <p className="text-xs text-slate-500">{m.autor}</p>
                        </div>
                      </div>
                      {m.isIndicacao && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                          Agrupa em Indicações
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => dialogSaplRef.current?.close()}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={importandoSapl || selecionadosSaplIds.length === 0}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer"
              >
                {importandoSapl
                  ? 'Baixando PDFs do SAPL...'
                  : `Importar (${selecionadosSaplIds.length}) Matérias`}
              </button>
            </div>
          </form>
        </dialog>
      </main>
    </div>
  );
}
