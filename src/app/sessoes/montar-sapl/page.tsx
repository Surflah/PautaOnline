'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import {
  Sparkles,
  BookOpen,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Save,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

interface SaplSessao {
  id: number;
  nome: string;
  numero: number;
  dataInicio: string;
  horaInicio: string;
  tipoId: number;
}

interface SaplExpedienteItem {
  numeroOrdem: number;
  materiaId: number;
  titulo: string;
  sigla: string;
  origem: 'Executivo' | 'Legislativo';
  autor: string;
  ementa: string;
  urgenciaDetectada: boolean;
  leiOrcamentaria: boolean;
}

interface ItemPrevia {
  numero: number;
  titulo: string;
  ementa: string;
  tipoItem: string;
  autor: string;
  votacaoEtapa: string;
  votavel: boolean;
  saplMateriaId?: number | null;
  pdfUrlsParaBaixar?: string[];
}

export default function MontarSaplPage() {
  const router = useRouter();
  const [sessoesSapl, setSessoesSapl] = useState<SaplSessao[]>([]);
  const [carregandoSessoes, setCarregandoSessoes] = useState(true);
  const [saplSessaoId, setSaplSessaoId] = useState<number>(0);
  const [nomeSessao, setNomeSessao] = useState('');

  // Parâmetros do Rito
  const [artigoRi, setArtigoRi] = useState<number>(127);
  const [textoArtigoPreview, setTextoArtigoPreview] = useState('');
  const [buscandoArtigo, setBuscandoArtigo] = useState(false);
  const [tratamentoServidor, setTratamentoServidor] = useState<'Servidora' | 'Servidor'>('Servidora');
  const [nomeServidor, setNomeServidor] = useState('Patrícia');
  const [numeroAtaAnterior, setNumeroAtaAnterior] = useState('96');
  const [anoAtaAnterior, setAnoAtaAnterior] = useState(String(new Date().getFullYear()));
  const [sessaoAnteriorNome, setSessaoAnteriorNome] = useState('Reunião Ordinária anterior');
  const [modoPdf, setModoPdf] = useState<'texto' | 'mesclado'>('texto');

  // Prévia & Triagem
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const [expedienteTriagem, setExpedienteTriagem] = useState<SaplExpedienteItem[]>([]);
  const [urgenciasIds, setUrgenciasIds] = useState<number[]>([]);
  const [itensPrevia, setItensPrevia] = useState<ItemPrevia[]>([]);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function init() {
      setCarregandoSessoes(true);
      try {
        const res = await fetch('/api/sapl?acao=sessoes');
        const data = await res.json();
        if (data.sessoes && data.sessoes.length > 0) {
          setSessoesSapl(data.sessoes);
          const primeira = data.sessoes[0];
          setSaplSessaoId(primeira.id);
          setNomeSessao(primeira.nome);
          if (data.sessoes[1]) {
            setSessaoAnteriorNome(data.sessoes[1].nome.split(' da ')[0]);
          }
        }
      } catch {
        setErro('Não foi possível conectar à API do SAPL de Itapoá.');
      } finally {
        setCarregandoSessoes(false);
      }
    }
    init();
  }, []);

  async function handleConsultarArtigo() {
    setBuscandoArtigo(true);
    try {
      const res = await fetch(`/api/sapl?acao=artigo&numero=${artigoRi}`);
      const data = await res.json();
      if (data.texto) setTextoArtigoPreview(data.texto);
    } finally {
      setBuscandoArtigo(false);
    }
  }

  async function handleGerarPrevia(urgenciasCustom?: number[]) {
    if (!saplSessaoId) return;
    setGerandoPrevia(true);
    setErro('');
    try {
      const res = await fetch('/api/sapl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'previa',
          saplSessaoId,
          nomeSessao,
          artigoRi,
          nomeServidor,
          tratamentoServidor,
          numeroAtaAnterior,
          anoAtaAnterior,
          sessaoAnteriorNome,
          modoPdf,
          urgenciasForcadasIds: urgenciasCustom,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Erro ao gerar prévia.');
        return;
      }

      setExpedienteTriagem(data.expediente || []);
      if (urgenciasCustom === undefined) {
        const detectadas = (data.expediente || [])
          .filter((e: SaplExpedienteItem) => e.urgenciaDetectada)
          .map((e: SaplExpedienteItem) => e.materiaId);
        setUrgenciasIds(detectadas);
      }
      setItensPrevia(data.itensPrevia || []);
    } finally {
      setGerandoPrevia(false);
    }
  }

  function alternarUrgenciaMateria(materiaId: number) {
    const novaLista = urgenciasIds.includes(materiaId)
      ? urgenciasIds.filter((id) => id !== materiaId)
      : [...urgenciasIds, materiaId];
    setUrgenciasIds(novaLista);
    handleGerarPrevia(novaLista);
  }

  function atualizarItemPrevia(idx: number, campo: keyof ItemPrevia, valor: unknown) {
    setItensPrevia((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it))
    );
  }

  async function handleGravarSessaoCompleta() {
    if (itensPrevia.length === 0) return;
    setGravando(true);
    setErro('');
    try {
      const res = await fetch('/api/sapl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'gravar_sessao',
          saplSessaoId,
          nomeSessao,
          itensPrevia,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao gravar sessão.');
        setGravando(false);
        return;
      }
      router.push(`/sessoes/${data.sessaoId}/pauta`);
    } catch {
      setErro('Erro ao salvar sessão e baixar PDFs do SAPL.');
      setGravando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              href="/sessoes"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Sessões</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-indigo-600" />
              <span>Montar Pauta Completa do SAPL</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Conecta diretamente a <strong>sapl.itapoa.sc.leg.br</strong>, busca o
              Regimento Interno (Norma 1749), faz a triagem do Expediente, monta o Rito
              Padrão e agrupa as Indicações.
            </p>
          </div>
        </div>

        {erro && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-bold flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Passo 1: Seleção da Sessão SAPL e Parâmetros do Rito */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-3">
            1. Parâmetros da Sessão e do Rito Regimental
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="select-sessao-sapl"
                className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
              >
                Sessão Plenária no SAPL de Itapoá
              </label>
              <select
                id="select-sessao-sapl"
                disabled={carregandoSessoes}
                value={saplSessaoId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSaplSessaoId(id);
                  const s = sessoesSapl.find((x) => x.id === id);
                  if (s) {
                    setNomeSessao(s.nome);
                    if (s.nome.toLowerCase().includes('comiss')) {
                      setModoPdf('mesclado');
                    } else {
                      setModoPdf('texto');
                    }
                  }
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900"
              >
                {carregandoSessoes ? (
                  <option>Consultando SAPL de Itapoá...</option>
                ) : (
                  sessoesSapl.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.dataInicio}] {s.nome}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="nome-sessao-editavel"
                className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
              >
                Título da Sessão no PautaOnline
              </label>
              <input
                id="nome-sessao-editavel"
                type="text"
                value={nomeSessao}
                onChange={(e) => setNomeSessao(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="artigo-ri"
                className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
              >
                Artigo do Regimento (1 a 265)
              </label>
              <div className="flex gap-2">
                <input
                  id="artigo-ri"
                  type="number"
                  min={1}
                  max={265}
                  value={artigoRi}
                  onChange={(e) => setArtigoRi(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleConsultarArtigo}
                  disabled={buscandoArtigo}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold shrink-0 cursor-pointer"
                >
                  {buscandoArtigo ? '...' : 'Ver Art.'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                Servidor(a) para Leitura
              </label>
              <div className="flex gap-2">
                <select
                  value={tratamentoServidor}
                  onChange={(e) =>
                    setTratamentoServidor(e.target.value as 'Servidora' | 'Servidor')
                  }
                  className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                >
                  <option value="Servidora">Servidora</option>
                  <option value="Servidor">Servidor</option>
                </select>
                <input
                  type="text"
                  value={nomeServidor}
                  onChange={(e) => setNomeServidor(e.target.value)}
                  placeholder="Patrícia"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                Ata da Sessão Anterior
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={numeroAtaAnterior}
                  onChange={(e) => setNumeroAtaAnterior(e.target.value)}
                  placeholder="Nº Ata (Ex: 96)"
                  className="w-24 px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
                <input
                  type="text"
                  value={sessaoAnteriorNome}
                  onChange={(e) => setSessaoAnteriorNome(e.target.value)}
                  placeholder="33ª Reunião Ordinária"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="modo-pdf-select"
                className="block text-xs font-bold uppercase text-slate-600 mb-1.5"
              >
                Modo de Anexo PDF (SAPL)
              </label>
              <select
                id="modo-pdf-select"
                value={modoPdf}
                onChange={(e) => setModoPdf(e.target.value as 'texto' | 'mesclado')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
              >
                <option value="texto">Apenas Texto Original (Ordinária)</option>
                <option value="mesclado">Mesclar Pareceres/Acessórios (Comissões)</option>
              </select>
            </div>
          </div>

          {textoArtigoPreview && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-800 whitespace-pre-wrap font-medium">
              <strong className="block text-blue-900 mb-1 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                <span>Texto Oficial do Art. {artigoRi} no SAPL (Norma 1749):</span>
              </strong>
              {textoArtigoPreview}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => handleGerarPrevia()}
              disabled={gerandoPrevia || !saplSessaoId}
              className="min-h-[50px] px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 flex items-center gap-2.5 cursor-pointer transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${gerandoPrevia ? 'animate-spin' : ''}`} />
              <span>
                {gerandoPrevia
                  ? 'Analisando Expediente e Ordem do Dia no SAPL...'
                  : '2. Gerar Triagem do Expediente e Prévia da Pauta'}
              </span>
            </button>
          </div>
        </section>

        {/* Passo 2: Triagem do Expediente (Urgência Art. 51 LOM) */}
        {expedienteTriagem.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-amber-600" />
                <span>
                  Triagem de Projetos Dando Entrada no Expediente (
                  {expedienteTriagem.length})
                </span>
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                Marque os projetos que possuem solicitação de Regime de Urgência (Art. 51
                LOM) para gerar o Item 7 de Deliberação.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {expedienteTriagem.map((exp) => {
                const isUrgente = urgenciasIds.includes(exp.materiaId);
                return (
                  <div
                    key={exp.materiaId}
                    onClick={() => alternarUrgenciaMateria(exp.materiaId)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                      isUrgente
                        ? 'bg-amber-50 border-amber-400 shadow-sm'
                        : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isUrgente}
                      onChange={() => {}}
                      className="w-5 h-5 mt-0.5 accent-amber-600 rounded cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">
                          {exp.titulo}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            exp.origem === 'Executivo'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {exp.origem}
                        </span>
                        {exp.leiOrcamentaria && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                            Orçamentária
                          </span>
                        )}
                        {isUrgente && (
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                            ⚡ Urgência Art. 51 LOM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {exp.ementa}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Passo 3: Revisão da Prévia Completa (Rito + Ordem do Dia + Indicações) */}
        {itensPrevia.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>
                    Prévia Completa da Pauta ({itensPrevia.length} itens gerados)
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confira ou edite os textos abaixo antes de gravar a sessão e baixar os
                  PDFs do SAPL.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGravarSessaoCompleta}
                disabled={gravando}
                className="min-h-[52px] px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2.5 cursor-pointer transition-all"
              >
                <Save className="w-5 h-5" />
                <span>
                  {gravando
                    ? 'Baixando PDFs do SAPL e Gravando Pauta...'
                    : 'Confirmar e Gravar Pauta Completa'}
                </span>
              </button>
            </div>

            <div className="space-y-4">
              {itensPrevia.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border ${
                    item.votavel
                      ? 'bg-white border-blue-200 shadow-xs'
                      : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 flex-1">
                      <span className="w-8 h-8 rounded-lg bg-[#0A2540] text-white font-extrabold text-xs flex items-center justify-center tabular-nums shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={item.titulo}
                        onChange={(e) =>
                          atualizarItemPrevia(idx, 'titulo', e.target.value)
                        }
                        aria-label={`Título do item ${idx + 1}`}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-extrabold text-sm text-slate-900 bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          item.votavel
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.votavel ? `Votável (${item.votacaoEtapa})` : 'Rito / Leitura'}
                      </span>
                      {item.pdfUrlsParaBaixar && item.pdfUrlsParaBaixar.length > 0 && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                          {item.pdfUrlsParaBaixar.length} PDF(s) SAPL
                        </span>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={item.ementa}
                    onChange={(e) => atualizarItemPrevia(idx, 'ementa', e.target.value)}
                    aria-label={`Texto ou ementa do item ${idx + 1}`}
                    className="w-full p-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-800 font-medium leading-relaxed"
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
