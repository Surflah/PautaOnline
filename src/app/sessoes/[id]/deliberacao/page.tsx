'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import { calcularQuorum, verificarVotoPresidente } from '@/core/regimento';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  RotateCcw,
  FileText,
  AlertTriangle,
  Crown,
  Mic2,
  Users,
  CheckCheck,
} from 'lucide-react';

interface PautaItemDelib {
  id: number;
  numero: number;
  titulo: string;
  ementa: string;
  tipoItem: string;
  autor: string;
  votacaoEtapa: string;
  votavel: boolean;
  pdfUrl: string | null;
}

interface VereadorDelib {
  id: number;
  nome: string;
  tratamento: string;
  isPresidente: boolean;
  isLicenciado: boolean;
}

interface VotoEstado {
  voto: 'sim' | 'nao' | 'abstencao' | 'ausente' | '';
  justificar: boolean;
}

export default function DeliberacaoPlenarioPage() {
  const params = useParams();
  const router = useRouter();
  const sessaoId = String(params.id || '');

  const [sessaoNome, setSessaoNome] = useState('');
  const [itens, setItens] = useState<PautaItemDelib[]>([]);
  const [itemAtual, setItemAtual] = useState<PautaItemDelib | null>(null);
  const [vereadores, setVereadores] = useState<VereadorDelib[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estado Chamada Nominal
  const [presencasMap, setPresencasMap] = useState<Record<number, 'Presente' | 'Ausente'>>({});
  const [chamadaAlteradaNaoSalva, setChamadaAlteradaNaoSalva] = useState(false);
  const [salvandoChamada, setSalvandoChamada] = useState(false);

  // Estado Votação
  const [votosMap, setVotosMap] = useState<Record<number, VotoEstado>>({});
  const [votacaoSalva, setVotacaoSalva] = useState(false);
  const [votosAlteradosNaoSalvos, setVotosAlteradosNaoSalvos] = useState(false);
  const [salvandoVotacao, setSalvandoVotacao] = useState(false);
  const [textoResultadoFixo, setTextoResultadoFixo] = useState('');
  const [popupResultado, setPopupResultado] = useState<{
    visivel: boolean;
    texto: string;
    aprovado: boolean;
  }>({ visivel: false, texto: '', aprovado: true });

  // Detector de Alteração de Pauta em Tempo Real
  const [carimboInicial, setCarimboInicial] = useState('');
  const [alertaPautaMudou, setAlertaPautaMudou] = useState<{
    mudou: boolean;
    atualTitulo: string;
    proximoTitulo: string;
  }>({ mudou: false, atualTitulo: '', proximoTitulo: '' });

  // Modal <dialog> de Vereadores Faltantes na Chamada
  const dialogFaltantesRef = useRef<HTMLDialogElement | null>(null);
  const [faltantesLista, setFaltantesLista] = useState<string[]>([]);

  const carregarDeliberacao = useCallback(
    async (targetItemId?: number) => {
      setCarregando(true);
      try {
        const query = targetItemId ? `?itemId=${targetItemId}` : '';
        const res = await fetch(`/api/sessoes/${sessaoId}/deliberacao${query}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) return;

        setSessaoNome(data.sessao.nome);
        setItens(data.itens || []);
        setItemAtual(data.itemAtual || null);
        setVereadores(data.vereadores || []);
        setCarimboInicial(data.carimbo || '');
        setAlertaPautaMudou({ mudou: false, atualTitulo: '', proximoTitulo: '' });

        // Popula presenças
        const pMap: Record<number, 'Presente' | 'Ausente'> = {};
        for (const p of data.presencas || []) {
          pMap[p.vereadorId] = p.status === 'Presente' ? 'Presente' : 'Ausente';
        }
        setPresencasMap(pMap);
        setChamadaAlteradaNaoSalva(false);

        // Popula votos
        const vMap: Record<number, VotoEstado> = {};
        let countVotos = 0;
        let sim = 0;
        let nao = 0;
        let abst = 0;
        for (const v of data.votos || []) {
          vMap[v.vereadorId] = {
            voto: v.voto,
            justificar: Boolean(v.justificar),
          };
          countVotos++;
          if (v.voto === 'sim') sim++;
          else if (v.voto === 'nao') nao++;
          else if (v.voto === 'abstencao') abst++;
        }
        setVotosMap(vMap);
        setVotosAlteradosNaoSalvos(false);

        if (countVotos > 0) {
          setVotacaoSalva(true);
          if (sim > nao) {
            setTextoResultadoFixo(
              nao === 0 && abst === 0
                ? `APROVADO POR UNANIMIDADE (${sim} votos favoráveis).`
                : `APROVADO por ${sim} voto(s) favorável(is) a ${nao} contrário(s).`
            );
          } else if (nao > sim) {
            setTextoResultadoFixo(
              `REJEITADO por ${nao} voto(s) contrário(s) a ${sim} favorável(is).`
            );
          } else {
            setTextoResultadoFixo(`EMPATE (${sim} x ${nao}).`);
          }
        } else {
          setVotacaoSalva(false);
          setTextoResultadoFixo('');
        }
      } finally {
        setCarregando(false);
      }
    },
    [sessaoId]
  );

  useEffect(() => {
    if (sessaoId) carregarDeliberacao();
  }, [sessaoId, carregarDeliberacao]);

  // Polling leve de 4s para detectar alterações de pauta feitas pela Secretaria
  useEffect(() => {
    if (!sessaoId || !carimboInicial || alertaPautaMudou.mudou) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/sessoes/${sessaoId}/estado-pauta?itemAtualId=${itemAtual?.id || 0}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.carimbo && data.carimbo !== carimboInicial) {
          setAlertaPautaMudou({
            mudou: true,
            atualTitulo: data.atualTitulo || '',
            proximoTitulo: data.proximoTitulo || '',
          });
        }
      } catch {
        // Ignora falha transitória de rede em plenário
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [sessaoId, carimboInicial, itemAtual?.id, alertaPautaMudou.mudou]);

  const idxAtual = itens.findIndex((i) => i.id === itemAtual?.id);
  const itemAnterior = idxAtual > 0 ? itens[idxAtual - 1] : null;
  const proximoItem =
    idxAtual >= 0 && idxAtual + 1 < itens.length ? itens[idxAtual + 1] : null;

  const isItemChamada = Boolean(
    itemAtual && !itemAtual.votavel && itemAtual.ementa.includes('[CHAMADA]')
  );

  async function irParaItem(novoItemId: number) {
    setPopupResultado({ visivel: false, texto: '', aprovado: true });
    await fetch(`/api/sessoes/${sessaoId}/deliberacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'mudar_item', pautaItemId: novoItemId }),
    });
    await carregarDeliberacao(novoItemId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function persistirChamadaNoServidor(
    mapa: Record<number, 'Presente' | 'Ausente'>
  ) {
    if (!itemAtual) return;
    setSalvandoChamada(true);
    try {
      await fetch(`/api/sessoes/${sessaoId}/deliberacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvar_chamada',
          pautaItemId: itemAtual.id,
          marcacoes: mapa,
        }),
      });
      setChamadaAlteradaNaoSalva(false);
    } finally {
      setSalvandoChamada(false);
    }
  }

  function marcarPresencaVereador(verId: number, status: 'Presente' | 'Ausente') {
    const novoMapa = { ...presencasMap, [verId]: status };
    setPresencasMap(novoMapa);
    setChamadaAlteradaNaoSalva(true);
    persistirChamadaNoServidor(novoMapa);
  }

  function marcarTodosPresentes() {
    const novoMapa: Record<number, 'Presente' | 'Ausente'> = {};
    for (const v of vereadores) {
      if (!v.isLicenciado) novoMapa[v.id] = 'Presente';
    }
    setPresencasMap(novoMapa);
    persistirChamadaNoServidor(novoMapa);
  }

  async function handleLimparChamada() {
    if (!itemAtual) return;
    if (
      !window.confirm(
        'Deseja realmente limpar a chamada? Todas as presenças e ausências marcadas neste item serão apagadas.'
      )
    ) {
      return;
    }
    await fetch(`/api/sessoes/${sessaoId}/deliberacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'limpar_chamada', pautaItemId: itemAtual.id }),
    });
    setPresencasMap({});
    setChamadaAlteradaNaoSalva(false);
  }

  function handleTentarAvancarItem() {
    if (isItemChamada) {
      const ativos = vereadores.filter((v) => !v.isLicenciado);
      const faltando = ativos
        .filter((v) => !presencasMap[v.id])
        .map((v) => `${v.tratamento} ${v.nome}`);

      if (faltando.length > 0) {
        setFaltantesLista(faltando);
        dialogFaltantesRef.current?.showModal();
        return;
      }
    }

    avancarParaProximoConfirmado();
  }

  function avancarParaProximoConfirmado() {
    dialogFaltantesRef.current?.close();
    if (proximoItem) {
      irParaItem(proximoItem.id);
    } else {
      router.push(`/palavra-livre?sessaoId=${sessaoId}`);
    }
  }

  // Manipulação de Votação
  function selecionarVotoVereador(
    verId: number,
    voto: 'sim' | 'nao' | 'abstencao' | 'ausente'
  ) {
    setVotosMap((prev) => ({
      ...prev,
      [verId]: {
        voto,
        justificar: prev[verId]?.justificar || false,
      },
    }));
    setVotosAlteradosNaoSalvos(true);
  }

  function alternarJustificarVoto(verId: number) {
    setVotosMap((prev) => ({
      ...prev,
      [verId]: {
        voto: prev[verId]?.voto || '',
        justificar: !prev[verId]?.justificar,
      },
    }));
    setVotosAlteradosNaoSalvos(true);
  }

  function marcarUnanimidadeSim() {
    const novo: Record<number, VotoEstado> = {};
    const isComplementar = Boolean(
      itemAtual?.tipoItem.toLowerCase().includes('projeto de lei complementar')
    );
    for (const v of vereadores) {
      if (v.isLicenciado) continue;
      if (v.isPresidente && !isComplementar) continue;
      novo[v.id] = { voto: 'sim', justificar: false };
    }
    setVotosMap(novo);
    setVotosAlteradosNaoSalvos(true);
  }

  async function handleSalvarVotacao(e: React.FormEvent) {
    e.preventDefault();
    if (!itemAtual) return;
    setSalvandoVotacao(true);

    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/deliberacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvar_votacao',
          pautaItemId: itemAtual.id,
          votos: votosMap,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setVotacaoSalva(true);
        setVotosAlteradosNaoSalvos(false);
        setTextoResultadoFixo(data.textoResultado);
        setPopupResultado({
          visivel: true,
          texto: data.textoResultado,
          aprovado: Boolean(data.aprovado),
        });
      }
    } finally {
      setSalvandoVotacao(false);
    }
  }

  // Cálculos de Quórum e Regra de Voto do Presidente
  const vereadoresAtivos = vereadores.filter((v) => !v.isLicenciado);
  const marcadosPresencaCount = vereadoresAtivos.filter((v) =>
    Boolean(presencasMap[v.id])
  ).length;
  const presentesCount = vereadoresAtivos.filter(
    (v) => presencasMap[v.id] === 'Presente'
  ).length;
  const infoQuorum = calcularQuorum(vereadores, presentesCount);

  const votosSimNaoPresidente = Object.entries(votosMap).reduce(
    (acc, [verIdStr, val]) => {
      const vObj = vereadores.find((v) => v.id === Number(verIdStr));
      if (!vObj || vObj.isPresidente || vObj.isLicenciado) return acc;
      if (val.voto === 'sim') acc.sim++;
      else if (val.voto === 'nao') acc.nao++;
      return acc;
    },
    { sim: 0, nao: 0 }
  );

  const regraPresidente = verificarVotoPresidente({
    tipoItem: itemAtual?.tipoItem || '',
    votosFavoraveis: votosSimNaoPresidente.sim,
    votosContrarios: votosSimNaoPresidente.nao,
  });

  const temMarcacaoNaoSalvaNaTela = votosAlteradosNaoSalvos || chamadaAlteradaNaoSalva;
  const proximoDesabilitado = Boolean(itemAtual?.votavel && !votacaoSalva);

  // Separa ementa para o modo [CHAMADA]
  const partesEmentaChamada = itemAtual?.ementa.split('[CHAMADA]') || [''];

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-100"
      onClick={() => {
        if (popupResultado.visivel) {
          setPopupResultado((prev) => ({ ...prev, visivel: false }));
        }
      }}
    >
      <NavbarInstitucional />

      {/* Faixa de Alerta em Tempo Real quando a Pauta é alterada pela Secretaria */}
      {alertaPautaMudou.mudou && (
        <button
          type="button"
          onClick={() => carregarDeliberacao(itemAtual?.id)}
          className={`w-full p-5 text-center shadow-2xl border-b-4 transition-all cursor-pointer sticky top-20 z-50 ${
            temMarcacaoNaoSalvaNaTela
              ? 'bg-red-700 text-white border-red-900'
              : 'bg-amber-400 text-slate-950 border-amber-600'
          }`}
        >
          <p className="text-xl font-extrabold">A pauta foi alterada.</p>
          <p className="text-2xl font-black mt-1">Toque para atualizar esta tela.</p>
          <p className="text-base font-semibold mt-2">
            {alertaPautaMudou.atualTitulo
              ? `Você continua em: ${alertaPautaMudou.atualTitulo}. `
              : 'Você continua no item atual. '}
            {alertaPautaMudou.proximoTitulo
              ? `O próximo passou a ser: ${alertaPautaMudou.proximoTitulo}.`
              : ''}
          </p>
          {temMarcacaoNaoSalvaNaTela && (
            <div className="mt-3 inline-block px-4 py-2 rounded-xl bg-amber-100 text-amber-950 font-bold text-sm">
              Atenção: há votos marcados nesta tela que ainda não foram gravados. Atualizar
              agora apaga essas marcações.
            </div>
          )}
        </button>
      )}

      {/* Popup Central de Resultado da Votação (#faixaResultado) */}
      {popupResultado.visivel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="alert"
            className={`max-w-2xl w-full p-8 rounded-3xl bg-white shadow-2xl border-4 text-center cursor-pointer transform transition-all ${
              popupResultado.aprovado
                ? 'border-blue-600 text-blue-900'
                : 'border-red-600 text-red-800'
            }`}
          >
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-2">
              Resultado Oficial da Deliberação (Toque para fechar)
            </p>
            <p className="text-2xl sm:text-3xl font-black leading-snug">
              {popupResultado.texto}
            </p>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Barra de Topo de Navegação de Itens (Ergonomia de Tablet) */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!itemAnterior}
              onClick={() => itemAnterior && irParaItem(itemAnterior.id)}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold text-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <select
              aria-label="Selecionar item da pauta"
              value={itemAtual?.id || ''}
              onChange={(e) => irParaItem(Number(e.target.value))}
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-extrabold text-sm sm:text-base text-slate-900 max-w-xs sm:max-w-md truncate"
            >
              {itens.map((it) => (
                <option key={it.id} value={it.id}>
                  Item {it.numero}: {it.titulo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between lg:justify-end gap-3">
            {itemAtual?.pdfUrl && (
              <a
                href={itemAtual.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-sm flex items-center gap-2 transition-all"
              >
                <FileText className="w-4 h-4" />
                <span>Abrir PDF</span>
              </a>
            )}

            <button
              type="button"
              disabled={proximoDesabilitado}
              onClick={handleTentarAvancarItem}
              className={`min-h-[52px] px-6 py-3 rounded-xl font-extrabold text-base flex items-center gap-2 shadow-md transition-all ${
                proximoDesabilitado
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : proximoItem
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
              }`}
            >
              {proximoItem ? (
                <>
                  <span>Próximo Item</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  <Mic2 className="w-5 h-5" />
                  <span>Ir para Espaço Regimental</span>
                </>
              )}
            </button>
          </div>
        </section>

        {carregando ? (
          <div className="bg-white rounded-3xl p-12 text-center text-slate-500 font-bold text-lg shadow-xs">
            Carregando item da deliberação...
          </div>
        ) : !itemAtual ? (
          <div className="bg-white rounded-3xl p-12 text-center space-y-4 shadow-xs">
            <p className="text-lg font-bold text-slate-700">
              Esta sessão ainda não possui itens cadastrados na pauta.
            </p>
            <Link
              href={`/sessoes/${sessaoId}/pauta`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm"
            >
              Cadastrar Itens na Pauta
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Título Principal do Item */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="px-3.5 py-1.5 rounded-xl bg-[#0A2540] text-white font-black text-base tabular-nums">
                    Item {itemAtual.numero} de {itens.length}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                    {itemAtual.tipoItem}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500">{sessaoNome}</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-blue-950 tracking-tight">
                Item {itemAtual.numero}: {itemAtual.titulo}
              </h1>

              {/* MODO 1: ITEM NÃO-VOTÁVEL COMUM */}
              {!itemAtual.votavel && !isItemChamada && (
                <div className="space-y-6">
                  <div className="p-6 sm:p-8 rounded-2xl bg-amber-50/90 border-l-8 border-amber-400 text-slate-900 text-xl sm:text-2xl font-semibold leading-relaxed whitespace-pre-line shadow-xs">
                    {itemAtual.ementa || itemAtual.titulo}
                  </div>
                  <p className="text-center text-lg font-bold italic text-slate-500">
                    Este item faz parte do rito / expediente e não é votável.
                  </p>
                </div>
              )}

              {/* MODO 2: ITEM COM [CHAMADA] NOMINAL */}
              {isItemChamada && (
                <div className="space-y-6">
                  {partesEmentaChamada[0]?.trim() && (
                    <div className="p-5 sm:p-6 rounded-2xl bg-amber-50/90 border-l-8 border-amber-400 text-slate-900 text-lg sm:text-xl font-semibold leading-relaxed whitespace-pre-line">
                      {partesEmentaChamada[0].trim()}
                    </div>
                  )}

                  {/* Barra de Ações Rápidas da Chamada */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span>
                        Marcados: {marcadosPresencaCount} de {vereadoresAtivos.length}{' '}
                        parlamentares ativos
                      </span>
                      {salvandoChamada && (
                        <span className="text-xs text-blue-600 font-semibold">
                          (Salvando...)
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={marcarTodosPresentes}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Marcar Todos Presentes</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleLimparChamada}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Limpar Chamada</span>
                      </button>
                    </div>
                  </div>

                  {/* Tabela de Chamada Nominal */}
                  <div
                    className="overflow-x-auto rounded-2xl border border-slate-200"
                    role="region"
                    aria-label="Tabela de Chamada Nominal dos Vereadores"
                    tabIndex={0}
                  >
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0A2540] text-white text-sm font-extrabold uppercase">
                          <th scope="col" className="py-4 px-6 w-1/2">
                            Parlamentar
                          </th>
                          <th scope="col" className="py-4 px-6 text-center">
                            Presente
                          </th>
                          <th scope="col" className="py-4 px-6 text-center">
                            Ausente
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-lg">
                        {vereadores.map((v) => {
                          const status = presencasMap[v.id];
                          return (
                            <tr
                              key={v.id}
                              className={`transition-colors ${
                                v.isLicenciado
                                  ? 'bg-slate-100 text-slate-400 italic'
                                  : status === 'Presente'
                                  ? 'bg-emerald-100/80 font-bold text-emerald-950'
                                  : status === 'Ausente'
                                  ? 'bg-red-50/70 text-red-900'
                                  : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-4 px-6 font-extrabold">
                                <div className="flex items-center gap-2.5">
                                  <span>
                                    {v.nome}
                                    {v.isPresidente ? ' (Presidente)' : ''}
                                  </span>
                                  {v.isLicenciado && (
                                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600 not-italic">
                                      Licenciado
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-6 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`presenca-${v.id}`}
                                    disabled={v.isLicenciado}
                                    checked={status === 'Presente'}
                                    onChange={() =>
                                      marcarPresencaVereador(v.id, 'Presente')
                                    }
                                    className="w-7 h-7 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                              <td className="py-3 px-6 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`presenca-${v.id}`}
                                    disabled={v.isLicenciado}
                                    checked={status === 'Ausente'}
                                    onChange={() =>
                                      marcarPresencaVereador(v.id, 'Ausente')
                                    }
                                    className="w-7 h-7 accent-red-600 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Indicador de Quórum Regimental */}
                  {marcadosPresencaCount === vereadoresAtivos.length && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`p-5 rounded-2xl text-center text-2xl font-black border-2 ${
                        infoQuorum.temQuorum
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                          : 'bg-red-50 border-red-500 text-red-900'
                      }`}
                    >
                      {infoQuorum.temQuorum
                        ? `✅ Há quórum regimental. (${presentesCount} presentes de ${infoQuorum.totalAtivos} ativos)`
                        : `⚠️ Não há quórum regimental. (${presentesCount} presentes; mínimo exigido: ${infoQuorum.minimoQuorum})`}
                    </div>
                  )}

                  {partesEmentaChamada[1]?.trim() && (
                    <div className="p-5 sm:p-6 rounded-2xl bg-amber-50/90 border-l-8 border-amber-400 text-slate-900 text-lg sm:text-xl font-semibold leading-relaxed whitespace-pre-line">
                      {partesEmentaChamada[1].trim()}
                    </div>
                  )}
                </div>
              )}

              {/* MODO 3: ITEM VOTÁVEL */}
              {itemAtual.votavel && (
                <div className="space-y-6">
                  {itemAtual.ementa && (
                    <p className="text-base sm:text-lg italic text-slate-600 text-center max-w-4xl mx-auto leading-relaxed">
                      {itemAtual.ementa}
                    </p>
                  )}

                  <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-center text-lg sm:text-xl font-extrabold">
                    {itemAtual.votacaoEtapa} — Autor:{' '}
                    <span className="text-blue-950">
                      {itemAtual.autor || 'Mesa Diretora / Diversos'}
                    </span>
                  </div>

                  {/* Os 3 Passos Narrados para o Presidente ler */}
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-emerald-50 border-l-6 border-emerald-600 text-emerald-950 text-lg sm:text-xl font-medium">
                      1 - Solicito que seja feita a leitura do(a){' '}
                      <strong className="font-extrabold text-blue-950">
                        {itemAtual.titulo}
                      </strong>
                    </div>
                    <div className="p-4 rounded-xl bg-cyan-50 border-l-6 border-cyan-600 text-cyan-950 text-lg sm:text-xl font-medium">
                      2 - Em <strong className="font-extrabold">DISCUSSÃO</strong> o(a){' '}
                      <strong className="font-extrabold text-blue-950">
                        {itemAtual.titulo}
                      </strong>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-100 border-l-6 border-slate-600 text-slate-900 text-lg sm:text-xl font-medium">
                      3 - Em{' '}
                      <strong className="font-extrabold">{itemAtual.votacaoEtapa}</strong>{' '}
                      o(a){' '}
                      <strong className="font-extrabold text-blue-950">
                        {itemAtual.titulo}
                      </strong>
                    </div>
                  </div>

                  {/* Aviso Regimental de Projeto de Lei Complementar ou Empate */}
                  {regraPresidente.motivo === 'LEI_COMPLEMENTAR' && (
                    <div className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-400 text-amber-950 font-extrabold text-center text-base sm:text-lg flex items-center justify-center gap-2">
                      <Crown className="w-5 h-5 text-amber-700 shrink-0" />
                      <span>
                        Projeto de Lei Complementar: O Presidente vota normalmente nesta
                        matéria.
                      </span>
                    </div>
                  )}

                  {regraPresidente.motivo === 'EMPATE' && (
                    <div className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 font-extrabold text-center text-base sm:text-lg flex items-center justify-center gap-2">
                      <Crown className="w-5 h-5 text-amber-700 shrink-0" />
                      <span>
                        Empate detectado ({votosSimNaoPresidente.sim} x{' '}
                        {votosSimNaoPresidente.nao}): O Voto de Minerva do Presidente foi
                        habilitado!
                      </span>
                    </div>
                  )}

                  {/* Formulário e Tabela de Votação */}
                  <form onSubmit={handleSalvarVotacao} className="space-y-5">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={marcarUnanimidadeSim}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Preencher Unanimidade (Todos Sim)</span>
                      </button>
                    </div>

                    <div
                      className="overflow-x-auto rounded-2xl border border-slate-200 shadow-xs"
                      role="region"
                      aria-label="Tabela de Votação Nominal"
                      tabIndex={0}
                    >
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#0A2540] text-white text-sm font-extrabold uppercase">
                            <th scope="col" className="py-4 px-5 w-1/3">
                              Vereador
                            </th>
                            <th scope="col" className="py-4 px-3 text-center">
                              Sim
                            </th>
                            <th scope="col" className="py-4 px-3 text-center">
                              Não
                            </th>
                            <th scope="col" className="py-4 px-3 text-center">
                              Justificar
                            </th>
                            <th scope="col" className="py-4 px-3 text-center">
                              Abstenção
                            </th>
                            <th scope="col" className="py-4 px-3 text-center">
                              Ausente/Atestado
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-lg">
                          {vereadores.map((v) => {
                            const estadoVoto = votosMap[v.id] || {
                              voto: '',
                              justificar: false,
                            };
                            const desabilitado =
                              v.isLicenciado ||
                              (v.isPresidente && !regraPresidente.presidentePodeVotar);

                            return (
                              <tr
                                key={v.id}
                                className={`transition-colors ${
                                  v.isLicenciado
                                    ? 'bg-slate-100 text-slate-400 italic'
                                    : estadoVoto.justificar
                                    ? 'bg-yellow-200/90 font-black text-slate-950'
                                    : estadoVoto.voto === 'sim'
                                    ? 'bg-emerald-50/70'
                                    : estadoVoto.voto === 'nao'
                                    ? 'bg-red-50/70'
                                    : 'bg-white hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-4 px-5 font-extrabold">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>
                                      {v.nome}
                                      {v.isPresidente ? ' (Presidente)' : ''}
                                    </span>
                                    {v.isLicenciado && (
                                      <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600 not-italic">
                                        Licenciado
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`voto-${v.id}`}
                                      disabled={desabilitado}
                                      checked={estadoVoto.voto === 'sim'}
                                      onChange={() => selecionarVotoVereador(v.id, 'sim')}
                                      className="w-7 h-7 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                  </label>
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`voto-${v.id}`}
                                      disabled={desabilitado}
                                      checked={estadoVoto.voto === 'nao'}
                                      onChange={() => selecionarVotoVereador(v.id, 'nao')}
                                      className="w-7 h-7 accent-red-600 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                  </label>
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      disabled={v.isLicenciado}
                                      checked={estadoVoto.justificar}
                                      onChange={() => alternarJustificarVoto(v.id)}
                                      title="Marcar para justificar o voto"
                                      className="w-6 h-6 accent-amber-500 rounded cursor-pointer disabled:cursor-not-allowed"
                                    />
                                  </label>
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`voto-${v.id}`}
                                      disabled={desabilitado}
                                      checked={estadoVoto.voto === 'abstencao'}
                                      onChange={() =>
                                        selecionarVotoVereador(v.id, 'abstencao')
                                      }
                                      className="w-7 h-7 accent-amber-600 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                  </label>
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center justify-center w-full min-h-[48px] cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`voto-${v.id}`}
                                      disabled={desabilitado}
                                      checked={estadoVoto.voto === 'ausente'}
                                      onChange={() =>
                                        selecionarVotoVereador(v.id, 'ausente')
                                      }
                                      className="w-7 h-7 accent-slate-600 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                  </label>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col items-center gap-4 pt-2">
                      <button
                        type="submit"
                        disabled={salvandoVotacao}
                        className="min-h-[56px] px-10 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xl shadow-lg shadow-blue-600/25 flex items-center gap-3 cursor-pointer transition-all"
                      >
                        <Save className="w-6 h-6" />
                        <span>
                          {salvandoVotacao ? 'Gravando Votação...' : '💾 Salvar Votação'}
                        </span>
                      </button>

                      {textoResultadoFixo ? (
                        <div
                          id="resultadoFixo"
                          className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 text-blue-950 font-black text-xl text-center w-full max-w-2xl"
                        >
                          {textoResultadoFixo}
                        </div>
                      ) : (
                        <p className="text-red-600 font-extrabold text-base text-center">
                          Por favor, registre e salve os votos antes de avançar para o
                          próximo item.
                        </p>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal <dialog> de Alerta de Vereadores Faltantes na Chamada */}
        <dialog
          ref={dialogFaltantesRef}
          aria-labelledby="modal-faltantes-title"
          onClick={(e) => {
            if (e.target === dialogFaltantesRef.current)
              dialogFaltantesRef.current?.close();
          }}
          className="rounded-3xl p-0 backdrop:bg-slate-900/60 shadow-2xl border border-slate-200 w-full max-w-md m-auto"
        >
          <div className="p-7 space-y-5">
            <div className="flex items-center justify-center gap-2 text-amber-700 font-black text-xl">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              <h3 id="modal-faltantes-title">Presença não marcada</h3>
            </div>
            <p className="text-base font-semibold text-slate-700">
              Ainda falta marcar a presença de:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-base font-extrabold text-slate-900 max-h-52 overflow-y-auto">
              {faltantesLista.map((nome, i) => (
                <li key={i}>{nome}</li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => dialogFaltantesRef.current?.close()}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base cursor-pointer"
              >
                Voltar e marcar
              </button>
              <button
                type="button"
                onClick={avancarParaProximoConfirmado}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-700 text-white font-extrabold text-base cursor-pointer"
              >
                Avançar mesmo assim
              </button>
            </div>
          </div>
        </dialog>
      </main>
    </div>
  );
}
