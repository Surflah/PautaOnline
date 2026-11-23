'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { calcularQuorum, verificarVotoPresidente } from '@/core/regimento';
import {
  prepararFalaPresidente,
  limparTextoPresidente,
  isDeliberacaoUrgencia,
} from '@/core/fala-presidente';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  RotateCcw,
  AlertTriangle,
  Crown,
  Users,
  CheckCheck,
  Maximize2,
  Minimize2,
  Play,
  PauseCircle,
  Mic2,
  Minus,
  Plus,
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

const TAMANHOS_FONTE = [
  'text-xl sm:text-2xl',
  'text-2xl sm:text-3xl',
  'text-3xl sm:text-4xl',
  'text-4xl sm:text-5xl',
];

export default function TabletPresidentePage() {
  const params = useParams();
  const router = useRouter();
  const sessaoId = String(params.id || '');

  const [iniciado, setIniciado] = useState(false);
  const [emTelaCheia, setEmTelaCheia] = useState(false);
  const [nivelFonte, setNivelFonte] = useState(1); // 0..3

  const [sessaoNome, setSessaoNome] = useState('');
  const [itens, setItens] = useState<PautaItemDelib[]>([]);
  const [itemAtual, setItemAtual] = useState<PautaItemDelib | null>(null);
  const [vereadores, setVereadores] = useState<VereadorDelib[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estado Chamada Nominal
  const [presencasMap, setPresencasMap] = useState<
    Record<number, 'Presente' | 'Ausente'>
  >({});
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

  // Modal <dialog> nativo de Vereadores Faltantes na Chamada
  const dialogFaltantesRef = useRef<HTMLDialogElement | null>(null);
  const [faltantesLista, setFaltantesLista] = useState<string[]>([]);

  useEffect(() => {
    const onFsChange = () => {
      setEmTelaCheia(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  async function ativarTelaCheia() {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }
    } catch {
      // Alguns navegadores móveis (ex.: iOS Safari) ignoram requestFullscreen; segue em modo tela limpa
    }
  }

  async function alternarTelaCheia() {
    try {
      if (!document.fullscreenElement) {
        await ativarTelaCheia();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignora erro de permissão
    }
  }

  async function handleIniciarSessao() {
    await ativarTelaCheia();
    setIniciado(true);
  }

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

        const pMap: Record<number, 'Presente' | 'Ausente'> = {};
        for (const p of data.presencas || []) {
          pMap[p.vereadorId] = p.status === 'Presente' ? 'Presente' : 'Ausente';
        }
        setPresencasMap(pMap);
        setChamadaAlteradaNaoSalva(false);

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
        // Ignora falha transitória de rede
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [sessaoId, carimboInicial, itemAtual?.id, alertaPautaMudou.mudou]);

  const idxAtual = itens.findIndex((i) => i.id === itemAtual?.id);
  const itemAnterior = idxAtual > 0 ? itens[idxAtual - 1] : null;
  const proximoItem =
    idxAtual >= 0 && idxAtual + 1 < itens.length ? itens[idxAtual + 1] : null;

  const isItemVotavel = Boolean(
    itemAtual?.votavel && !isDeliberacaoUrgencia(itemAtual.titulo)
  );
  const isItemChamada = Boolean(
    itemAtual && !isItemVotavel && itemAtual.ementa.includes('[CHAMADA]')
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

  function marcarPresencaVereador(
    verId: number,
    status: 'Presente' | 'Ausente'
  ) {
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
        'Deseja limpar todas as presenças e ausências marcadas neste item?'
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

  const temMarcacaoNaoSalvaNaTela =
    votosAlteradosNaoSalvos || chamadaAlteradaNaoSalva;
  const proximoDesabilitado = Boolean(isItemVotavel && !votacaoSalva);

  const partesEmentaChamada = itemAtual?.ementa.split('[CHAMADA]') || [''];
  const blocosFala = itemAtual
    ? prepararFalaPresidente(itemAtual.titulo, itemAtual.ementa)
    : [];
  const classeFonte = TAMANHOS_FONTE[nivelFonte];

  // TELA DE ENTRADA — Ao clicar em Iniciar, entra em Tela Cheia limpa
  if (!iniciado) {
    return (
      <main className="min-h-screen w-full bg-gradient-to-b from-[#0A2540] via-[#0F2942] to-[#081A2E] text-white flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="max-w-xl w-full bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-8 sm:p-12 shadow-2xl space-y-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Brasão da Câmara Municipal de Itapoá"
            className="w-24 h-24 mx-auto object-contain bg-white rounded-2xl p-2 shadow-lg"
          />

          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-blue-200">
              Câmara Municipal de Itapoá — Mesa Diretora
            </p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Tablet do Presidente
            </h1>
            <p className="text-base sm:text-lg font-medium text-slate-200 pt-1">
              {carregando ? 'Carregando pauta da sessão...' : sessaoNome || 'Sessão Legislativa'}
            </p>
          </div>

          <button
            type="button"
            disabled={carregando || itens.length === 0}
            onClick={handleIniciarSessao}
            className="w-full min-h-[68px] px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-50 text-slate-950 font-black text-xl sm:text-2xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/25 cursor-pointer transition-all"
          >
            <Play className="w-7 h-7 fill-current" />
            <span>Iniciar em Tela Cheia</span>
          </button>

          {!carregando && itens.length === 0 && (
            <p className="text-sm font-semibold text-amber-200">
              Esta sessão ainda não possui itens cadastrados na pauta.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
      onClick={() => {
        if (popupResultado.visivel) {
          setPopupResultado((prev) => ({ ...prev, visivel: false }));
        }
      }}
    >
      {/* Faixa de Alerta em Tempo Real quando a Pauta é alterada pela Secretaria */}
      {alertaPautaMudou.mudou && (
        <button
          type="button"
          onClick={() => carregarDeliberacao(itemAtual?.id)}
          className={`w-full p-5 text-center shadow-2xl border-b-4 transition-all cursor-pointer sticky top-0 z-50 ${
            temMarcacaoNaoSalvaNaTela
              ? 'bg-red-700 text-white border-red-900'
              : 'bg-amber-400 text-slate-950 border-amber-600'
          }`}
        >
          <p className="text-xl font-extrabold">A pauta foi alterada.</p>
          <p className="text-2xl font-black mt-1">Toque para atualizar esta tela.</p>
          {temMarcacaoNaoSalvaNaTela && (
            <div className="mt-3 inline-block px-4 py-2 rounded-xl bg-amber-100 text-amber-950 font-bold text-sm">
              Atenção: há marcações não gravadas nesta tela.
            </div>
          )}
        </button>
      )}

      {/* Popup Central de Resultado da Votação */}
      {popupResultado.visivel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="alert"
            className={`max-w-2xl w-full p-8 rounded-3xl bg-white shadow-2xl border-4 text-center cursor-pointer ${
              popupResultado.aprovado
                ? 'border-blue-600 text-blue-900'
                : 'border-red-600 text-red-800'
            }`}
          >
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-2">
              Resultado Oficial (Toque para fechar)
            </p>
            <p className="text-2xl sm:text-3xl font-black leading-snug">
              {popupResultado.texto}
            </p>
          </div>
        </div>
      )}

      {/* Controles mínimos discretos no topo (apenas tamanho da letra e tela cheia — sem menus nem links) */}
      <div className="flex items-center justify-between px-4 sm:px-8 pt-4 pb-2">
        <span className="text-xs sm:text-sm font-bold text-slate-400 tabular-nums">
          {idxAtual >= 0 ? `${idxAtual + 1} / ${itens.length}` : ''}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNivelFonte((n) => Math.max(0, n - 1))}
            disabled={nivelFonte === 0}
            aria-label="Diminuir tamanho do texto"
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center gap-1 font-bold text-sm cursor-pointer shadow-xs"
          >
            <Minus className="w-4 h-4" />
            <span>A</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setNivelFonte((n) => Math.min(TAMANHOS_FONTE.length - 1, n + 1))
            }
            disabled={nivelFonte === TAMANHOS_FONTE.length - 1}
            aria-label="Aumentar tamanho do texto"
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center gap-1 font-bold text-sm cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>A</span>
          </button>
          <button
            type="button"
            onClick={alternarTelaCheia}
            aria-label={emTelaCheia ? 'Sair da tela cheia' : 'Ativar tela cheia'}
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer shadow-xs"
          >
            {emTelaCheia ? (
              <Minimize2 className="w-5 h-5" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Área Principal de Leitura e Ações do Presidente */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 pt-2 pb-32 flex flex-col justify-center">
        {carregando ? (
          <div className="bg-white rounded-3xl p-12 text-center text-slate-500 font-bold text-xl shadow-xs">
            Carregando...
          </div>
        ) : !itemAtual ? (
          <div className="bg-white rounded-3xl p-12 text-center text-slate-600 font-bold text-xl shadow-xs">
            Nenhum item disponível na pauta.
          </div>
        ) : (
          <div className="space-y-6">
            {/* MODO 1: SOMENTE LEITURA (RITO / EXPEDIENTE) — SEM TÍTULO "ITEM X: ..." */}
            {!isItemVotavel && !isItemChamada && (
              <div className="space-y-6">
                {blocosFala.map((bloco, i) =>
                  bloco.tipo === 'pausa' ? (
                    <div
                      key={`pausa-${i}`}
                      className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-slate-200/80 border-2 border-dashed border-slate-400 text-slate-800 font-extrabold text-base sm:text-lg"
                    >
                      <PauseCircle className="w-6 h-6 text-amber-600 shrink-0" />
                      <span>{bloco.rotulo}</span>
                    </div>
                  ) : (
                    <div
                      key={`fala-${i}`}
                      className={`p-7 sm:p-10 rounded-3xl bg-white border-l-[10px] shadow-md space-y-3 ${
                        bloco.ordem === 1
                          ? 'border-blue-600'
                          : 'border-emerald-600'
                      }`}
                    >
                      {blocosFala.length > 1 && (
                        <span
                          className={`inline-block px-3.5 py-1 rounded-full text-xs sm:text-sm font-black uppercase tracking-wider ${
                            bloco.ordem === 1
                              ? 'bg-blue-100 text-blue-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {bloco.ordem}ª Fala
                        </span>
                      )}
                      <p
                        className={`${classeFonte} font-bold text-slate-950 leading-relaxed whitespace-pre-line`}
                      >
                        {bloco.texto}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* MODO 2: CHAMADA NOMINAL (PRESENÇA) */}
            {isItemChamada && (
              <div className="space-y-6">
                {partesEmentaChamada[0]?.trim() && (
                  <div className="p-6 sm:p-8 rounded-3xl bg-white border-l-[10px] border-blue-600 shadow-md space-y-2">
                    <span className="inline-block px-3.5 py-1 rounded-full bg-blue-100 text-blue-900 text-xs sm:text-sm font-black uppercase tracking-wider">
                      1ª Fala — Abertura da Chamada
                    </span>
                    <p
                      className={`${classeFonte} font-bold text-slate-950 leading-relaxed whitespace-pre-line`}
                    >
                      {limparTextoPresidente(partesEmentaChamada[0])}
                    </p>
                  </div>
                )}

                {/* Controles de Presença */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-md space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base font-extrabold text-slate-800">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span>
                        Presença: {marcadosPresencaCount} de{' '}
                        {vereadoresAtivos.length}
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
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Todos Presentes</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleLimparChamada}
                        className="min-h-[48px] px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Limpar</span>
                      </button>
                    </div>
                  </div>

                  <div
                    className="overflow-x-auto rounded-2xl border border-slate-200"
                    role="region"
                    aria-label="Tabela de Chamada Nominal"
                    tabIndex={0}
                  >
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0A2540] text-white text-sm font-extrabold uppercase">
                          <th scope="col" className="py-4 px-5 w-1/2">
                            Parlamentar
                          </th>
                          <th scope="col" className="py-4 px-4 text-center">
                            Presente
                          </th>
                          <th scope="col" className="py-4 px-4 text-center">
                            Ausente
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-lg sm:text-xl">
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
                                  : 'bg-white'
                              }`}
                            >
                              <td className="py-4 px-5 font-extrabold">
                                {v.nome}
                                {v.isPresidente ? ' (Presidente)' : ''}
                                {v.isLicenciado ? ' — Licenciado' : ''}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`presenca-tab-${v.id}`}
                                    disabled={v.isLicenciado}
                                    checked={status === 'Presente'}
                                    onChange={() =>
                                      marcarPresencaVereador(v.id, 'Presente')
                                    }
                                    className="w-7 h-7 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`presenca-tab-${v.id}`}
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

                  {marcadosPresencaCount === vereadoresAtivos.length && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`p-5 rounded-2xl text-center text-xl sm:text-2xl font-black border-2 ${
                        infoQuorum.temQuorum
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                          : 'bg-red-50 border-red-500 text-red-900'
                      }`}
                    >
                      {infoQuorum.temQuorum
                        ? `✅ Há quórum regimental (${presentesCount} presentes de ${infoQuorum.totalAtivos}).`
                        : `⚠️ Não há quórum regimental (${presentesCount} presentes; mínimo: ${infoQuorum.minimoQuorum}).`}
                    </div>
                  )}
                </div>

                {partesEmentaChamada[1]?.trim() && (
                  <div className="p-6 sm:p-8 rounded-3xl bg-white border-l-[10px] border-emerald-600 shadow-md space-y-2">
                    <span className="inline-block px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs sm:text-sm font-black uppercase tracking-wider">
                      2ª Fala — Após a Chamada
                    </span>
                    <p
                      className={`${classeFonte} font-bold text-slate-950 leading-relaxed whitespace-pre-line`}
                    >
                      {limparTextoPresidente(partesEmentaChamada[1])}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* MODO 3: ITEM VOTÁVEL (FALAS DE LEITURA, DISCUSSÃO E VOTAÇÃO + TABELA DE VOTOS) */}
            {isItemVotavel && (
              <div className="space-y-6">
                {/* 3 Passos de Fala do Presidente com indicação de pausa */}
                <div className="space-y-4">
                  <div className="p-6 rounded-3xl bg-white border-l-[10px] border-emerald-600 shadow-sm space-y-1.5">
                    <span className="inline-block px-3 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-black uppercase tracking-wider">
                      1ª Fala — Leitura
                    </span>
                    <p className={`${classeFonte} font-bold text-slate-950 leading-snug`}>
                      Solicito que seja feita a leitura do(a){' '}
                      <strong className="text-blue-900">{itemAtual.titulo}</strong>.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-200/70 border border-dashed border-slate-400 text-slate-700 font-bold text-sm">
                    <PauseCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Aguarde a leitura da matéria</span>
                  </div>

                  <div className="p-6 rounded-3xl bg-white border-l-[10px] border-cyan-600 shadow-sm space-y-1.5">
                    <span className="inline-block px-3 py-0.5 rounded-full bg-cyan-100 text-cyan-900 text-xs font-black uppercase tracking-wider">
                      2ª Fala — Discussão
                    </span>
                    <p className={`${classeFonte} font-bold text-slate-950 leading-snug`}>
                      Em <strong className="text-cyan-900">DISCUSSÃO</strong> o(a){' '}
                      <strong className="text-blue-900">{itemAtual.titulo}</strong>.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-200/70 border border-dashed border-slate-400 text-slate-700 font-bold text-sm">
                    <PauseCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Aguarde a discussão dos Vereadores</span>
                  </div>

                  <div className="p-6 rounded-3xl bg-white border-l-[10px] border-blue-700 shadow-sm space-y-1.5">
                    <span className="inline-block px-3 py-0.5 rounded-full bg-blue-100 text-blue-900 text-xs font-black uppercase tracking-wider">
                      3ª Fala — Votação
                    </span>
                    <p className={`${classeFonte} font-bold text-slate-950 leading-snug`}>
                      Em <strong className="text-blue-900">{itemAtual.votacaoEtapa}</strong>{' '}
                      o(a) <strong className="text-blue-900">{itemAtual.titulo}</strong>.
                    </p>
                    {itemAtual.autor && (
                      <p className="text-sm sm:text-base font-semibold text-slate-500 pt-1">
                        Autor: {itemAtual.autor}
                      </p>
                    )}
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
                      Empate ({votosSimNaoPresidente.sim} x {votosSimNaoPresidente.nao}):
                      Voto de Minerva do Presidente habilitado!
                    </span>
                  </div>
                )}

                {/* Formulário e Tabela de Votação */}
                <form
                  onSubmit={handleSalvarVotacao}
                  className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-md space-y-5"
                >
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={marcarUnanimidadeSim}
                      className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-sm font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Unanimidade (Todos Sim)</span>
                    </button>
                  </div>

                  <div
                    className="overflow-x-auto rounded-2xl border border-slate-200"
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
                            Ausente
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
                                  : 'bg-white'
                              }`}
                            >
                              <td className="py-4 px-5 font-extrabold">
                                {v.nome}
                                {v.isPresidente ? ' (Presidente)' : ''}
                                {v.isLicenciado ? ' — Licenciado' : ''}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`voto-tab-${v.id}`}
                                    disabled={desabilitado}
                                    checked={estadoVoto.voto === 'sim'}
                                    onChange={() => selecionarVotoVereador(v.id, 'sim')}
                                    className="w-7 h-7 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`voto-tab-${v.id}`}
                                    disabled={desabilitado}
                                    checked={estadoVoto.voto === 'nao'}
                                    onChange={() => selecionarVotoVereador(v.id, 'nao')}
                                    className="w-7 h-7 accent-red-600 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={v.isLicenciado}
                                    checked={estadoVoto.justificar}
                                    onChange={() => alternarJustificarVoto(v.id)}
                                    className="w-6 h-6 accent-amber-500 rounded cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </label>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`voto-tab-${v.id}`}
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
                                <label className="inline-flex items-center justify-center w-full min-h-[52px] cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`voto-tab-${v.id}`}
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
                      className="min-h-[60px] px-10 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xl shadow-lg flex items-center gap-3 cursor-pointer"
                    >
                      <Save className="w-6 h-6" />
                      <span>
                        {salvandoVotacao ? 'Gravando...' : 'Salvar Votação'}
                      </span>
                    </button>

                    {textoResultadoFixo ? (
                      <div
                        role="status"
                        aria-live="polite"
                        className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 text-blue-950 font-black text-xl text-center w-full max-w-2xl"
                      >
                        {textoResultadoFixo}
                      </div>
                    ) : (
                      <p className="text-red-600 font-extrabold text-base text-center">
                        Salve os votos antes de avançar.
                      </p>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Barra Fixa Inferior — Somente Voltar e Avançar */}
      <footer className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 sm:px-8 py-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={!itemAnterior}
            onClick={() => itemAnterior && irParaItem(itemAnterior.id)}
            className="min-h-[60px] flex-1 max-w-[240px] px-6 py-3.5 rounded-2xl bg-slate-200 hover:bg-slate-300 disabled:opacity-35 text-slate-900 font-black text-lg sm:text-xl flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-not-allowed transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
            <span>Voltar</span>
          </button>

          <button
            type="button"
            disabled={proximoDesabilitado}
            onClick={handleTentarAvancarItem}
            className={`min-h-[60px] flex-1 max-w-[300px] px-8 py-3.5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-2.5 shadow-md transition-all ${
              proximoDesabilitado
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : proximoItem
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
            }`}
          >
            {proximoItem ? (
              <>
                <span>Avançar</span>
                <ArrowRight className="w-6 h-6" />
              </>
            ) : (
              <>
                <Mic2 className="w-6 h-6" />
                <span>Espaço Regimental</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {/* Modal <dialog> nativo de Alerta de Vereadores Faltantes na Chamada */}
      <dialog
        ref={dialogFaltantesRef}
        aria-labelledby="modal-faltantes-tab-title"
        onClick={(e) => {
          const dlg = dialogFaltantesRef.current;
          if (!dlg) return;
          const r = dlg.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          ) {
            dlg.close();
          }
        }}
        className="rounded-3xl p-0 backdrop:bg-slate-900/60 shadow-2xl border border-slate-200 w-full max-w-md m-auto"
      >
        <div className="p-7 space-y-5">
          <div className="flex items-center justify-center gap-2 text-amber-700 font-black text-xl">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <h2 id="modal-faltantes-tab-title">Presença não marcada</h2>
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
              autoFocus
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
    </div>
  );
}
