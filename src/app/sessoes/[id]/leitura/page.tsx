'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  Maximize2,
  Tv,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  RotateCcw,
  Save,
  Ban,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';

interface PautaItemLeitura {
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

interface PaginaRoteiro {
  pagina_real: number;
  texto: string;
  pular?: boolean;
  audio_url?: string | null;
}

interface AncoraTexto {
  frac: number;
  canvasY: number;
}

export default function PainelProLeituraPage() {
  const params = useParams();
  const sessaoId = String(params.id || '');

  const [pdfjsPronto, setPdfjsPronto] = useState(false);
  const [sessaoNome, setSessaoNome] = useState('');
  const [itens, setItens] = useState<PautaItemLeitura[]>([]);
  const [itemAtivo, setItemAtivo] = useState<PautaItemLeitura | null>(null);
  const [paginas, setPaginas] = useState<PaginaRoteiro[]>([]);
  const [paginaIdx, setPaginaIdx] = useState(0); // 0-indexed
  const [sidebarAberta, setSidebarAberta] = useState(true);
  const [barraTopoVisivel, setBarraTopoVisivel] = useState(true);

  // Parâmetros de Voz, Velocidade e Rolagem
  const [vozTts, setVozTts] = useState('nova');
  const [playbackRate, setPlaybackRate] = useState(1.15);
  const [velocidadeScrollMult, setVelocidadeScrollMult] = useState(0.9); // 1.2 Lenta, 0.9 Normal, 0.7 Rápida, 0.5 Muito Rápida
  const [volumeBoost, setVolumeBoost] = useState(1.7);

  // Estado de Reprodução e Auto-Scroll
  const [isPlaying, setIsPlaying] = useState(false);
  const [gerandoAudio, setGerandoAudio] = useState(false);
  const [progressoAudioPct, setProgressoAudioPct] = useState(0);
  const [rolagemManualAtiva, setRolagemManualAtiva] = useState(false);
  const [mostrarGcFlutuante, setMostrarGcFlutuante] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');

  // Modal de Preparação do Roteiro (<dialog>)
  const modalPrepRef = useRef<HTMLDialogElement | null>(null);
  const [paginasEdicao, setPaginasEdicao] = useState<PaginaRoteiro[]>([]);
  const [revisandoIaModal, setRevisandoIaModal] = useState(false);
  const [salvandoModal, setSalvandoModal] = useState(false);

  // Referências PDF.js, Canvas, Audio & Web Audio API GainNode
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeConnectedRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const ancorasPaginaRef = useRef<AncoraTexto[]>([]);
  const pageContentBottomYRef = useRef<number>(0);

  const paginaAtualObj = paginas[paginaIdx] || null;

  // Carrega lista de itens da sessão
  useEffect(() => {
    async function init() {
      const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) return;
      setSessaoNome(data.sessao?.nome || '');
      const lista: PautaItemLeitura[] = data.itens || [];
      setItens(lista);

      // Seleciona automaticamente o primeiro item que possui PDF (ou o 1º item da sessão)
      const primeiroComPdf = lista.find((i) => Boolean(i.pdfUrl)) || lista[0] || null;
      if (primeiroComPdf) {
        selecionarItemParaLeitura(primeiroComPdf, false);
      }
    }
    if (sessaoId) init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId]);

  const selecionarItemParaLeitura = useCallback(
    async (item: PautaItemLeitura, ignoreCache = false) => {
      pararAudio();
      setItemAtivo(item);
      setPaginaIdx(0);
      setRolagemManualAtiva(false);
      setProgressoAudioPct(0);

      const q = `/api/sessoes/${sessaoId}/leitura?pautaId=${item.id}${
        ignoreCache ? '&ignoreCache=1' : ''
      }`;
      const res = await fetch(q, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.paginas)) {
        setPaginas(data.paginas);
        setPaginasEdicao(data.paginas);
        const primeiraNaoPulada = data.paginas.findIndex(
          (p: PaginaRoteiro) => !p.pular
        );
        setPaginaIdx(primeiraNaoPulada >= 0 ? primeiraNaoPulada : 0);
      }
    },
    [sessaoId]
  );

  // Renderiza a página do PDF e constrói as âncoras verticais do texto (Motor Ancorado)
  useEffect(() => {
    async function renderizarPaginaPdfEConstruirAncoras() {
      if (
        !pdfjsPronto ||
        !window.pdfjsLib ||
        !itemAtivo?.pdfUrl ||
        !canvasRef.current ||
        !paginaAtualObj
      ) {
        return;
      }

      try {
        const loadingTask = window.pdfjsLib.getDocument(itemAtivo.pdfUrl);
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;

        const numPag = Math.min(
          Math.max(1, paginaAtualObj.pagina_real),
          pdfDoc.numPages
        );
        const page = await pdfDoc.getPage(numPag);

        const containerWidth = viewportContainerRef.current?.clientWidth || 1000;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.min(2.0, (containerWidth * 0.88) / unscaled.width);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        // Extrai coordenadas reais do texto da página para rolagem ancorada
        const textContent = await page.getTextContent();
        const rawItems = textContent.items || [];

        const linhasExtraidas: { canvasY: number; palavras: string[] }[] = [];
        let maxContentY = viewport.height * 0.85;

        for (const it of rawItems) {
          const str = String(it.str || '').trim();
          if (!str) continue;

          // Ignora blocos após marcadores de assinatura digital ICP-Brasil
          if (/assinado digitalmente|código verificador|icp-brasil/i.test(str)) {
            break;
          }

          // Transformação de coordenada PDF (origem embaixo) para Canvas Y (origem no topo)
          const pdfY = it.transform ? Number(it.transform[5]) : 0;
          const [, canvasY] = viewport.convertToViewportPoint(0, pdfY);

          const pals = str
            .toLowerCase()
            .replace(/[^a-záàâãéêíóôõúç0-9\s]/gi, '')
            .split(/\s+/)
            .filter((w) => w.length >= 4);

          if (pals.length > 0) {
            linhasExtraidas.push({ canvasY, palavras: pals });
            if (canvasY > maxContentY && canvasY < viewport.height * 0.96) {
              maxContentY = canvasY;
            }
          }
        }

        pageContentBottomYRef.current = maxContentY;

        // Casa palavras-marco com o texto revisado da página para criar âncoras monotônicas
        const textoFalado = (paginaAtualObj.texto || '').toLowerCase();
        const totalChars = Math.max(1, textoFalado.length);
        const ancoras: AncoraTexto[] = [{ frac: 0, canvasY: 0 }];
        let buscaOffset = 0;
        let ultimoY = 0;

        for (const linha of linhasExtraidas) {
          const palavraChave = linha.palavras[0];
          const pos = textoFalado.indexOf(palavraChave, buscaOffset);
          if (pos !== -1 && pos - buscaOffset < 400) {
            const frac = Math.min(1, pos / totalChars);
            const yMonotonico = Math.max(ultimoY, linha.canvasY);
            ancoras.push({ frac, canvasY: yMonotonico });
            ultimoY = yMonotonico;
            buscaOffset = pos + palavraChave.length;
          }
        }

        ancoras.push({ frac: 1, canvasY: maxContentY });
        ancorasPaginaRef.current = ancoras;

        if (viewportContainerRef.current) {
          viewportContainerRef.current.scrollTop = 0;
        }
      } catch (err) {
        console.error('Erro ao renderizar página do PDF:', err);
      }
    }

    renderizarPaginaPdfEConstruirAncoras();
  }, [pdfjsPronto, itemAtivo?.pdfUrl, paginaAtualObj]);

  // Configura Web Audio API GainNode para amplificação limpa de voz em plenário
  function conectarGainNodeSeNecessario() {
    if (!audioRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      if (!sourceNodeConnectedRef.current) {
        const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
        const gain = audioCtxRef.current.createGain();
        gain.gain.value = volumeBoost;
        source.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        gainNodeRef.current = gain;
        sourceNodeConnectedRef.current = true;
      } else if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = volumeBoost;
      }
    } catch {
      // Ignora caso já conectado
    }
  }

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volumeBoost;
    }
  }, [volumeBoost]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Auto-oculta barra superior após 2.5s de leitura e exibe GC flutuante após 3s
  useEffect(() => {
    if (!isPlaying) {
      setBarraTopoVisivel(true);
      setMostrarGcFlutuante(false);
      return;
    }
    const t1 = setTimeout(() => setBarraTopoVisivel(false), 2500);
    const t2 = setTimeout(() => setMostrarGcFlutuante(true), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isPlaying]);

  // Motor de Auto-Scroll sincronizado com o tempo do áudio TTS
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    const atualizarScrollPorAudio = () => {
      const audio = audioRef.current;
      const container = viewportContainerRef.current;
      if (
        audio &&
        container &&
        !rolagemManualAtiva &&
        audio.duration > 0 &&
        !audio.paused
      ) {
        const fracTempo = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
        setProgressoAudioPct(Math.round(fracTempo * 100));

        // Interpola posição vertical nas âncoras do texto
        const ancoras = ancorasPaginaRef.current;
        let yAlvoCanvas = fracTempo * (pageContentBottomYRef.current || container.scrollHeight);

        if (ancoras.length >= 2) {
          for (let i = 0; i < ancoras.length - 1; i++) {
            const a0 = ancoras[i];
            const a1 = ancoras[i + 1];
            if (fracTempo >= a0.frac && fracTempo <= a1.frac) {
              const span = Math.max(0.0001, a1.frac - a0.frac);
              const t = (fracTempo - a0.frac) / span;
              yAlvoCanvas = a0.canvasY + t * (a1.canvasY - a0.canvasY);
              break;
            }
          }
        }

        // Mantém a linha ativa de leitura a ~42% da altura útil do container
        const linhaLeituraOffset = container.clientHeight * 0.42;
        const maxScrollPossivel = Math.max(
          0,
          container.scrollHeight - container.clientHeight
        );
        const scrollDesejado = Math.min(
          maxScrollPossivel,
          Math.max(0, (yAlvoCanvas - linhaLeituraOffset) / velocidadeScrollMult)
        );

        const diff = scrollDesejado - container.scrollTop;
        if (Math.abs(diff) > 0.5) {
          container.scrollTop += diff * 0.08;
        }
      }
      rafId = requestAnimationFrame(atualizarScrollPorAudio);
    };

    rafId = requestAnimationFrame(atualizarScrollPorAudio);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, rolagemManualAtiva, velocidadeScrollMult]);

  // Sincronização Master -> Slave a cada 500ms com o Telão de Leitura OBS
  useEffect(() => {
    if (!sessaoId || !itemAtivo) return;

    const timer = setInterval(async () => {
      const container = viewportContainerRef.current;
      const maxScroll = container
        ? Math.max(1, container.scrollHeight - container.clientHeight)
        : 1;
      const scrollY = container ? container.scrollTop : 0;
      const scrollRatio = Math.min(1, Math.max(0, scrollY / maxScroll));

      try {
        await fetch(`/api/sessoes/${sessaoId}/leitura-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pautaId: itemAtivo.id,
            titulo: itemAtivo.titulo,
            autor: itemAtivo.autor,
            etapa: itemAtivo.votacaoEtapa,
            pdfUrl: itemAtivo.pdfUrl,
            pagina: paginaAtualObj?.pagina_real || 1,
            scrollRatio,
            scrollY,
            maxScroll,
            audioUrl: audioRef.current?.src || null,
            isPlaying,
            currentTime: audioRef.current?.currentTime || 0,
            playbackRate,
          }),
        });
      } catch {
        // Ignora erro transitório
      }
    }, 500);

    return () => clearInterval(timer);
  }, [sessaoId, itemAtivo, paginaAtualObj?.pagina_real, isPlaying, playbackRate]);

  function pararAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }

  async function tocarPagina(idxAlvo: number) {
    if (!itemAtivo || !paginas[idxAlvo]) return;
    const pagObj = paginas[idxAlvo];

    if (pagObj.pular) {
      // Pula automaticamente página marcada como "Não ler"
      if (idxAlvo + 1 < paginas.length) {
        setPaginaIdx(idxAlvo + 1);
        tocarPagina(idxAlvo + 1);
      }
      return;
    }

    setGerandoAudio(true);
    setStatusFeedback(`Preparando voz para a Página ${pagObj.pagina_real}...`);

    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'gerar_audio',
          pautaId: itemAtivo.id,
          pagina: pagObj.pagina_real,
          texto: pagObj.texto,
          voz: vozTts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.audioUrl) {
        setStatusFeedback(data.error || 'Falha ao gerar áudio TTS.');
        setGerandoAudio(false);
        return;
      }

      setStatusFeedback(
        data.provedor === 'openai'
          ? `🔊 Voz Neural OpenAI (${vozTts})`
          : '🔊 Voz Google Português (Ativa)'
      );

      if (audioRef.current) {
        conectarGainNodeSeNecessario();
        audioRef.current.src = data.audioUrl;
        audioRef.current.playbackRate = playbackRate;
        await audioRef.current.play();
        setIsPlaying(true);
      }

      // Pré-carrega em background o áudio da próxima página legível
      const proxIdx = paginas.findIndex((p, i) => i > idxAlvo && !p.pular);
      if (proxIdx !== -1) {
        const proxPag = paginas[proxIdx];
        fetch(`/api/sessoes/${sessaoId}/leitura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acao: 'gerar_audio',
            pautaId: itemAtivo.id,
            pagina: proxPag.pagina_real,
            texto: proxPag.texto,
            voz: vozTts,
          }),
        }).catch(() => {});
      }
    } finally {
      setGerandoAudio(false);
    }
  }

  function handlePlayPause() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else if (audioRef.current.src && audioRef.current.currentTime > 0 && !audioRef.current.ended) {
      conectarGainNodeSeNecessario();
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      tocarPagina(paginaIdx);
    }
  }

  function handleAudioEnded() {
    setIsPlaying(false);
    // Avança automaticamente para a próxima página não marcada para pular
    const proxIdx = paginas.findIndex((p, i) => i > paginaIdx && !p.pular);
    if (proxIdx !== -1) {
      setPaginaIdx(proxIdx);
      setRolagemManualAtiva(false);
      setTimeout(() => tocarPagina(proxIdx), 400);
    } else {
      setStatusFeedback('✅ Leitura do documento concluída!');
    }
  }

  // Funções do Modal de Preparação do Roteiro (#modal-prep)
  function abrirModalPreparacao() {
    pararAudio();
    setPaginasEdicao(paginas.map((p) => ({ ...p })));
    modalPrepRef.current?.showModal();
  }

  async function handleRevisarIaNoModal() {
    if (!itemAtivo) return;
    setRevisandoIaModal(true);
    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'revisar_ia',
          pautaId: itemAtivo.id,
          paginas: paginasEdicao,
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.paginas)) {
        setPaginasEdicao(data.paginas);
      }
    } finally {
      setRevisandoIaModal(false);
    }
  }

  async function handleRecarregarOriginalDoPdf() {
    if (!itemAtivo) return;
    await selecionarItemParaLeitura(itemAtivo, true);
  }

  async function handleSalvarEGerarAudiosModal(e: React.FormEvent) {
    e.preventDefault();
    if (!itemAtivo) return;
    setSalvandoModal(true);
    try {
      const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvar_roteiro',
          pautaId: itemAtivo.id,
          paginas: paginasEdicao,
        }),
      });
      if (res.ok) {
        setPaginas(paginasEdicao);
        setItens((prev) =>
          prev.map((i) => (i.id === itemAtivo.id ? { ...i, jaRevisado: true } : i))
        );
        modalPrepRef.current?.close();
        const primeiraValida = paginasEdicao.findIndex((p) => !p.pular);
        const alvo = primeiraValida >= 0 ? primeiraValida : 0;
        setPaginaIdx(alvo);
        tocarPagina(alvo);
      }
    } finally {
      setSalvandoModal(false);
    }
  }

  function alternarTelaCheia() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div
      onMouseMove={() => {
        if (!barraTopoVisivel) setBarraTopoVisivel(true);
      }}
      className="h-screen w-screen overflow-hidden flex bg-[#0F172A] text-slate-100"
    >
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            setPdfjsPronto(true);
          }
        }}
      />

      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        crossOrigin="anonymous"
        className="hidden"
      />

      {/* Barra Lateral Retrátil de Itens da Pauta */}
      <aside
        className={`bg-[#0A192F] border-r border-slate-800 flex flex-col transition-all duration-300 shrink-0 ${
          sidebarAberta ? 'w-80' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div>
            <Link
              href={`/sessoes/${sessaoId}/pauta`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar à Pauta</span>
            </Link>
            <h1 className="text-base font-extrabold text-white mt-1 truncate">
              Painel Pro de Leitura
            </h1>
            <p className="text-[11px] text-slate-400 truncate">{sessaoNome}</p>
          </div>
          <Link
            href={`/sessoes/${sessaoId}/revisar-lote`}
            className="px-2.5 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 text-xs font-bold flex items-center gap-1 shrink-0"
            title="Revisar todos os itens da sessão em lote com IA"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Lote IA</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {itens.map((it) => {
            const ativo = itemAtivo?.id === it.id;
            let corBadge = 'bg-slate-700 text-slate-300';
            if (it.votacaoEtapa === 'Única Votação')
              corBadge = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
            else if (it.votacaoEtapa === 'Primeira Votação')
              corBadge = 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
            else if (it.votacaoEtapa === 'Segunda Votação')
              corBadge = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';

            return (
              <button
                key={it.id}
                type="button"
                onClick={() => selecionarItemParaLeitura(it, false)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  ativo
                    ? 'bg-blue-600/25 border-blue-500 text-white shadow-md'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-black text-blue-400 tabular-nums">
                    Item #{it.numero}
                  </span>
                  <div className="flex items-center gap-1">
                    {it.jaRevisado && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                        ✨ IA
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${corBadge}`}>
                      {it.votavel ? it.votacaoEtapa : 'Rito'}
                    </span>
                  </div>
                </div>
                <p className="text-xs font-bold leading-snug line-clamp-2">
                  {it.titulo}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Área Principal do Teleprompter PDF */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Barra Superior de Controles (Auto-Oculta durante leitura) */}
        <header
          className={`bg-[#1E293B]/95 backdrop-blur-md border-b border-slate-700/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-30 transition-all duration-300 ${
            barraTopoVisivel
              ? 'translate-y-0 opacity-100'
              : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarAberta((v) => !v)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Alternar barra lateral"
            >
              {sidebarAberta ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            {/* Controles de Página e Play/Pause */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                disabled={paginaIdx <= 0}
                onClick={() => {
                  pararAudio();
                  setPaginaIdx((p) => Math.max(0, p - 1));
                }}
                className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="Página Anterior"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={gerandoAudio}
                onClick={handlePlayPause}
                className={`px-4 py-2 rounded-lg font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all ${
                  isPlaying
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>{gerandoAudio ? 'Gerando...' : 'Ler Página'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={paginaIdx >= paginas.length - 1}
                onClick={() => {
                  pararAudio();
                  setPaginaIdx((p) => Math.min(paginas.length - 1, p + 1));
                }}
                className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="Próxima Página"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <span className="px-2.5 text-xs font-bold text-slate-300 tabular-nums">
                Pág. {paginaAtualObj?.pagina_real || 1}/{paginas.length || 1}
              </span>
            </div>
          </div>

          {/* Seletores de Voz, Velocidade, Rolagem e Ganho */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="Selecionar Voz TTS"
              value={vozTts}
              onChange={(e) => setVozTts(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold"
            >
              <option value="nova">🎙️ Voz: Nova (OpenAI)</option>
              <option value="shimmer">🎙️ Voz: Shimmer (OpenAI)</option>
              <option value="coral">🎙️ Voz: Coral (OpenAI)</option>
              <option value="sage">🎙️ Voz: Sage (OpenAI)</option>
              <option value="onyx">🎙️ Voz: Onyx (OpenAI)</option>
              <option value="echo">🎙️ Voz: Echo (OpenAI)</option>
              <option value="alloy">🎙️ Voz: Alloy (OpenAI)</option>
              <option value="google">🌐 Voz: Google pt-BR</option>
            </select>

            <select
              aria-label="Velocidade da Fala"
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold tabular-nums"
            >
              <option value={0.9}>Fala: 0.90x</option>
              <option value={1.0}>Fala: 1.00x</option>
              <option value={1.1}>Fala: 1.10x</option>
              <option value={1.15}>Fala: 1.15x</option>
              <option value={1.2}>Fala: 1.20x</option>
              <option value={1.25}>Fala: 1.25x (Padrão)</option>
            </select>

            <select
              aria-label="Velocidade de Rolagem"
              value={velocidadeScrollMult}
              onChange={(e) => setVelocidadeScrollMult(Number(e.target.value))}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold"
            >
              <option value={1.2}>Rolagem: Lenta</option>
              <option value={0.9}>Rolagem: Normal</option>
              <option value={0.7}>Rolagem: Rápida</option>
              <option value={0.5}>Rolagem: Muito Rápida</option>
            </select>

            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <select
                aria-label="Ganho de Volume"
                value={volumeBoost}
                onChange={(e) => setVolumeBoost(Number(e.target.value))}
                className="bg-transparent text-slate-100 font-bold focus:outline-none"
              >
                <option value={1.0}>100%</option>
                <option value={1.4}>140%</option>
                <option value={1.7}>170% (Boost)</option>
                <option value={2.0}>200%</option>
              </select>
            </div>

            <button
              type="button"
              onClick={abrirModalPreparacao}
              className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Preparar Roteiro IA</span>
            </button>

            <a
              href={`/sessoes/${sessaoId}/telao-leitura`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 font-bold flex items-center gap-1.5"
              title="Abrir Telão de Leitura sincronizado para Projetor / OBS Studio"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Telão OBS</span>
            </a>

            <button
              type="button"
              onClick={alternarTelaCheia}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* GC Flutuante ("Em Leitura") */}
        {mostrarGcFlutuante && itemAtivo && (
          <div className="fixed top-20 left-8 z-40 bg-white/95 text-slate-900 border-l-8 border-blue-700 rounded-xl shadow-2xl px-5 py-3 max-w-md pointer-events-none animate-in fade-in slide-in-from-left-6 duration-500">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">
              🔊 Em Leitura — Pág. {paginaAtualObj?.pagina_real || 1} ({progressoAudioPct}%)
            </p>
            <p className="text-sm font-extrabold truncate">{itemAtivo.titulo}</p>
          </div>
        )}

        {/* Alerta de Rolagem Manual Ativa */}
        {rolagemManualAtiva && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-amber-500 text-slate-950 px-5 py-3 rounded-2xl shadow-2xl font-extrabold text-sm">
            <AlertTriangle className="w-5 h-5" />
            <span>⚠️ Rolagem Manual Ativa</span>
            <button
              type="button"
              onClick={() => setRolagemManualAtiva(false)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 text-white text-xs font-black cursor-pointer"
            >
              ▶ Retomar Auto-Scroll
            </button>
          </div>
        )}

        {/* Área Central de Exibição do Documento PDF ou Teleprompter Texto */}
        <div
          ref={viewportContainerRef}
          onWheel={() => {
            if (isPlaying) setRolagemManualAtiva(true);
          }}
          onTouchMove={() => {
            if (isPlaying) setRolagemManualAtiva(true);
          }}
          className="flex-1 overflow-y-auto p-6 flex flex-col items-center relative"
        >
          {statusFeedback && (
            <div className="mb-4 px-4 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-bold text-blue-300">
              {statusFeedback}
            </div>
          )}

          {itemAtivo?.pdfUrl ? (
            <canvas
              ref={canvasRef}
              className="block mx-auto shadow-2xl rounded-xl bg-white"
            />
          ) : (
            <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 space-y-6 my-auto">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase">
                <FileText className="w-4 h-4" />
                <span>Texto do Roteiro (Item sem PDF anexado)</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white">
                {itemAtivo?.titulo || 'Selecione um item'}
              </h2>
              <p className="text-xl sm:text-2xl leading-relaxed text-slate-200 whitespace-pre-line font-medium">
                {paginaAtualObj?.texto || itemAtivo?.ementa || ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal <dialog> de Preparação do Roteiro de Leitura (#modal-prep) */}
      <dialog
        ref={modalPrepRef}
        aria-labelledby="modal-prep-title"
        onClick={(e) => {
          if (e.target === modalPrepRef.current) modalPrepRef.current?.close();
        }}
        className="rounded-3xl p-0 backdrop:bg-slate-950/75 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 w-full max-w-4xl m-auto"
      >
        <form onSubmit={handleSalvarEGerarAudiosModal} className="p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 id="modal-prep-title" className="text-xl font-extrabold text-white">
                ✨ Preparação do Roteiro de Leitura — {itemAtivo?.titulo}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Revise o texto extraído de cada página, marque páginas para pular (ex.:
                assinaturas) e gere a voz sincronizada.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={revisandoIaModal}
                onClick={handleRevisarIaNoModal}
                className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {revisandoIaModal ? 'Revisando com IA...' : '✨ Revisar Formatações'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleRecarregarOriginalDoPdf}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Recarregar Original do PDF</span>
              </button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
            {paginasEdicao.map((p, idx) => (
              <div
                key={p.pagina_real}
                className={`p-4 rounded-2xl border transition-all ${
                  p.pular
                    ? 'bg-slate-950/60 border-red-900/50 opacity-60'
                    : 'bg-slate-800/80 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <span className="text-sm font-extrabold text-blue-400">
                    Página {p.pagina_real}
                  </span>

                  <label className="inline-flex items-center gap-2 text-xs font-bold text-red-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(p.pular)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPaginasEdicao((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, pular: checked } : x))
                        );
                      }}
                      className="w-4 h-4 accent-red-600 rounded"
                    />
                    <Ban className="w-3.5 h-3.5" />
                    <span>🚫 Não ler esta página</span>
                  </label>
                </div>

                <textarea
                  rows={5}
                  disabled={Boolean(p.pular)}
                  value={p.texto}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPaginasEdicao((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, texto: val } : x))
                    );
                  }}
                  aria-label={`Texto de leitura da Página ${p.pagina_real}`}
                  className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 leading-relaxed font-medium"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => modalPrepRef.current?.close()}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={salvandoModal}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold flex items-center gap-2 cursor-pointer shadow-lg"
            >
              {salvandoModal ? (
                <span>Salvando e Gerando Voz...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>💾 Salvar e Gerar Áudios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
