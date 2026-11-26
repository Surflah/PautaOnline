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
  ListOrdered,
  KeyRound,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Columns2,
  Rows3,
  ChevronLeft,
  ChevronRight,
  Square,
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

interface PontoSincroniaAudio {
  fracAudio: number;
  fracTexto: number;
}

interface LinhaPdfAncorada {
  numeroLinha: number;
  canvasY: number;
  altura: number;
  texto: string;
  fracInicio: number;
  fracFim: number;
}

interface VozNativaSistema {
  name: string;
  lang: string;
}

type ModoSaidaAudio = 'ambos' | 'obs' | 'local';

function hashTextoRapido(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function normalizarTxt(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function probeWord(str: string): string | null {
  const words = normalizarTxt(str).split(' ');
  let best = '';
  for (const w of words) {
    if (w.length >= 4 && /[a-z]/.test(w) && w.length > best.length) {
      best = w;
    }
  }
  return best.length >= 4 ? best : null;
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

  // Voz padrão Andressa (Google Cloud TTS) e saída de áudio para o Telão OBS
  const [vozTts, setVozTts] = useState('gcloud:pt-BR-Standard-D');
  const [vozesNativasPt, setVozesNativasPt] = useState<VozNativaSistema[]>([]);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [velocidadeScrollMult, setVelocidadeScrollMult] = useState(1.0);
  const [modoRolagem, setModoRolagem] = useState<'linha' | 'continuo'>('linha');
  const [volumeBoost, setVolumeBoost] = useState(1.7);
  const [saidaAudio, setSaidaAudio] = useState<ModoSaidaAudio>('ambos');

  // Estado de IA para Revisão de PDFs e Tabelas
  const [iaStatus, setIaStatus] = useState<{
    geminiAtivo: boolean;
    openaiAtivo: boolean;
  }>({ geminiAtivo: false, openaiAtivo: false });
  const [mostrarConfigIaModal, setMostrarConfigIaModal] = useState(false);
  const [chaveGeminiModal, setChaveGeminiModal] = useState('');
  const [salvandoChaveIaModal, setSalvandoChaveIaModal] = useState(false);
  const [avisoModalPrep, setAvisoModalPrep] = useState<string>('');

  // Estado de Reprodução, Buffer de Áudios e Auto-Scroll Linha a Linha
  const [isPlaying, setIsPlaying] = useState(false);
  const [gerandoAudio, setGerandoAudio] = useState(false);
  const [audiosProntosCount, setAudiosProntosCount] = useState(0);
  const [progressoAudioPct, setProgressoAudioPct] = useState(0);
  const [rolagemManualAtiva, setRolagemManualAtiva] = useState(false);
  const [mostrarGcFlutuante, setMostrarGcFlutuante] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');
  const [linhaAtivaIdx, setLinhaAtivaIdx] = useState<number>(0);
  const [totalLinhasPagina, setTotalLinhasPagina] = useState<number>(0);
  const [canvasDim, setCanvasDim] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Modal de Preparação do Roteiro (<dialog>) — Lado a Lado (PDF + Editor)
  const modalPrepRef = useRef<HTMLDialogElement | null>(null);
  const containerModalPdfRef = useRef<HTMLDivElement | null>(null);
  const canvasModalRef = useRef<HTMLCanvasElement | null>(null);
  const audioPreviaModalRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalRenderTaskRef = useRef<any>(null);
  const modalRenderSeqRef = useRef<number>(0);

  const [modalAberto, setModalAberto] = useState(false);
  const [paginaModalIdx, setPaginaModalIdx] = useState(0);
  const [modoVisaoModal, setModoVisaoModal] = useState<'focada' | 'lista'>('focada');
  const [zoomPdfModal, setZoomPdfModal] = useState(1.0);
  const [ouvindoPreviaModal, setOuvindoPreviaModal] = useState(false);
  const [gerandoPreviaModal, setGerandoPreviaModal] = useState(false);

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

  // Refs sempre atualizadas para evitar closures antigas em callbacks assíncronos
  const paginasRef = useRef<PaginaRoteiro[]>([]);
  const paginaIdxRef = useRef<number>(0);
  const itemAtivoRef = useRef<PautaItemLeitura | null>(null);
  const audioUrlAtivoRef = useRef<string | null>(null);
  const versaoRoteiroRef = useRef<number>(0);

  useEffect(() => {
    paginasRef.current = paginas;
  }, [paginas]);
  useEffect(() => {
    paginaIdxRef.current = paginaIdx;
  }, [paginaIdx]);
  useEffect(() => {
    itemAtivoRef.current = itemAtivo;
  }, [itemAtivo]);

  // Cache de áudios por hash completo do texto + página + voz
  const cacheAudioPaginasRef = useRef<
    Record<
      string,
      {
        audioUrl: string;
        provedor: string;
        vozUsada: string;
        mapaTempo: PontoSincroniaAudio[];
      }
    >
  >({});
  const mapaTempoAtivoRef = useRef<PontoSincroniaAudio[]>([
    { fracAudio: 0, fracTexto: 0 },
    { fracAudio: 1, fracTexto: 1 },
  ]);
  const linhasPdfRef = useRef<LinhaPdfAncorada[]>([]);
  const pageContentBottomYRef = useRef<number>(0);
  const fracFalaNativaRef = useRef<number>(0);
  const usandoFalaNativaRef = useRef<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);
  const renderSeqRef = useRef<number>(0);

  const paginaAtualObj = paginas[paginaIdx] || null;

  // Carrega preferência de saída de áudio salva neste computador
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem('pauta_saida_audio');
      if (salvo === 'obs' || salvo === 'ambos' || salvo === 'local') {
        setSaidaAudio(salvo);
      }
    } catch {
      // Ignora
    }
  }, []);

  // Aplica mudo local quando operador escolhe "Só no Telão OBS (Mudo aqui)"
  useEffect(() => {
    try {
      window.localStorage.setItem('pauta_saida_audio', saidaAudio);
    } catch {
      // Ignora
    }
    const silenciarLocal = saidaAudio === 'obs';
    if (audioRef.current) {
      audioRef.current.muted = silenciarLocal;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = silenciarLocal ? 0 : volumeBoost;
    }
  }, [saidaAudio, volumeBoost]);

  // Garante detecção do PDF.js mesmo em navegação client-side
  useEffect(() => {
    const checkPdfJs = () => {
      if (typeof window !== 'undefined' && window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        setPdfjsPronto(true);
        return true;
      }
      return false;
    };
    if (!checkPdfJs()) {
      const timer = setInterval(() => {
        if (checkPdfJs()) clearInterval(timer);
      }, 250);
      return () => clearInterval(timer);
    }
  }, []);

  // Carrega vozes nativas em Português disponíveis no navegador/sistema operacional
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const carregarVozesSistema = () => {
      const todas = window.speechSynthesis.getVoices() || [];
      const pt = todas
        .filter((v) => v.lang.toLowerCase().startsWith('pt'))
        .map((v) => ({ name: v.name, lang: v.lang }));
      setVozesNativasPt(pt);
    };
    carregarVozesSistema();
    window.speechSynthesis.onvoiceschanged = carregarVozesSistema;
  }, []);

  const recalcularAudiosProntos = useCallback(
    (pautaId: number, listaPags: PaginaRoteiro[], voz: string) => {
      let prontos = 0;
      for (const p of listaPags) {
        if (p.pular) continue;
        const k = `${pautaId}_${p.pagina_real}_${voz}_${hashTextoRapido(
          (p.texto || '').trim()
        )}`;
        if (cacheAudioPaginasRef.current[k]) prontos++;
      }
      setAudiosProntosCount(prontos);
    },
    []
  );

  const prepararAudioEmBackground = useCallback(
    async (
      pautaId: number,
      pag: PaginaRoteiro,
      voz: string,
      listaReferencia?: PaginaRoteiro[]
    ) => {
      const textoLimpo = (pag?.texto || '').trim();
      if (!pag || pag.pular || !textoLimpo || voz.startsWith('nativa:')) {
        return null;
      }

      const chaveCache = `${pautaId}_${pag.pagina_real}_${voz}_${hashTextoRapido(
        textoLimpo
      )}`;
      if (cacheAudioPaginasRef.current[chaveCache]) {
        recalcularAudiosProntos(
          pautaId,
          listaReferencia || paginasRef.current,
          voz
        );
        return cacheAudioPaginasRef.current[chaveCache];
      }

      try {
        const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acao: 'gerar_audio',
            pautaId,
            pagina: pag.pagina_real,
            texto: textoLimpo,
            voz,
          }),
        });
        const data = await res.json();
        if (res.ok && data.audioUrl) {
          const entrada = {
            audioUrl: data.audioUrl,
            provedor: data.provedor || 'gcloud',
            vozUsada: data.vozUsada || voz,
            mapaTempo: Array.isArray(data.mapaTempo)
              ? data.mapaTempo
              : [
                  { fracAudio: 0, fracTexto: 0 },
                  { fracAudio: 1, fracTexto: 1 },
                ],
          };
          cacheAudioPaginasRef.current[chaveCache] = entrada;
          recalcularAudiosProntos(
            pautaId,
            listaReferencia || paginasRef.current,
            voz
          );
          return entrada;
        }
      } catch {
        // Ignora erro de pré-carga
      }
      return null;
    },
    [sessaoId, recalcularAudiosProntos]
  );

  const gerarTodosAudiosBackground = useCallback(
    async (
      pautaId: number,
      listaPags: PaginaRoteiro[],
      voz: string,
      versaoEsperada: number
    ) => {
      if (voz.startsWith('nativa:')) return;
      for (const pag of listaPags) {
        if (versaoRoteiroRef.current !== versaoEsperada) return;
        if (pag.pular || !pag.texto.trim()) continue;
        await prepararAudioEmBackground(pautaId, pag, voz, listaPags);
      }
    },
    [prepararAudioEmBackground]
  );

  // Envio imediato de estado para o Telão OBS (sem esperar o próximo ciclo de 400ms)
  const enviarSyncImediato = useCallback(
    async (overrides?: {
      isPlaying?: boolean;
      audioUrl?: string | null;
      pagina?: number;
      currentTime?: number;
    }) => {
      const item = itemAtivoRef.current;
      if (!sessaoId || !item) return;

      const container = viewportContainerRef.current;
      const maxScroll = container
        ? Math.max(1, container.scrollHeight - container.clientHeight)
        : 1;
      const scrollY = container ? container.scrollTop : 0;
      const scrollRatio = Math.min(1, Math.max(0, scrollY / maxScroll));
      const pagAtual =
        paginasRef.current[paginaIdxRef.current]?.pagina_real || 1;

      try {
        await fetch(`/api/sessoes/${sessaoId}/leitura-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pautaId: item.id,
            titulo: item.titulo,
            autor: item.autor,
            etapa: item.votacaoEtapa,
            pdfUrl: item.pdfUrl,
            pagina: overrides?.pagina ?? pagAtual,
            scrollRatio,
            scrollY,
            maxScroll,
            audioUrl:
              overrides?.audioUrl !== undefined
                ? overrides.audioUrl
                : audioUrlAtivoRef.current,
            isPlaying: overrides?.isPlaying ?? isPlaying,
            tocarNoTelao: saidaAudio !== 'local',
            currentTime:
              overrides?.currentTime ?? (audioRef.current?.currentTime || 0),
            playbackRate,
            volumeBoost,
          }),
        });
      } catch {
        // Ignora erro transitório
      }
    },
    [sessaoId, isPlaying, saidaAudio, playbackRate, volumeBoost]
  );

  const selecionarItemParaLeitura = useCallback(
    async (item: PautaItemLeitura, ignoreCache = false) => {
      pararAudio();
      const novaVersao = ++versaoRoteiroRef.current;
      setItemAtivo(item);
      itemAtivoRef.current = item;
      setPaginas([]);
      paginasRef.current = [];
      setPaginaIdx(0);
      paginaIdxRef.current = 0;
      setLinhaAtivaIdx(0);
      setAudiosProntosCount(0);
      setRolagemManualAtiva(false);
      setProgressoAudioPct(0);
      audioUrlAtivoRef.current = null;
      setStatusFeedback('Carregando documento e extraindo linhas para leitura...');

      const q = `/api/sessoes/${sessaoId}/leitura?pautaId=${item.id}${
        ignoreCache ? '&ignoreCache=1' : ''
      }`;
      const res = await fetch(q, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.paginas)) {
        setPaginas(data.paginas);
        paginasRef.current = data.paginas;
        setPaginasEdicao(data.paginas);
        const primeiraNaoPulada = data.paginas.findIndex(
          (p: PaginaRoteiro) => !p.pular
        );
        const idxInicial = primeiraNaoPulada >= 0 ? primeiraNaoPulada : 0;
        setPaginaIdx(idxInicial);
        paginaIdxRef.current = idxInicial;
        setStatusFeedback(
          `Documento pronto (${data.paginas.length} pág.). Clique em "Ler Página" para iniciar.`
        );

        // Pré-gera áudio da 1ª página e demais em background
        gerarTodosAudiosBackground(item.id, data.paginas, vozTts, novaVersao);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessaoId, vozTts, gerarTodosAudiosBackground]
  );

  // Carrega lista de itens da sessão + status da IA
  useEffect(() => {
    async function init() {
      const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) return;
      setSessaoNome(data.sessao?.nome || '');
      if (data.iaStatus) {
        setIaStatus({
          geminiAtivo: Boolean(data.iaStatus.geminiAtivo),
          openaiAtivo: Boolean(data.iaStatus.openaiAtivo),
        });
      }
      const lista: PautaItemLeitura[] = data.itens || [];
      setItens(lista);

      const primeiroComPdf =
        lista.find((i) => Boolean(i.pdfUrl)) || lista[0] || null;
      if (primeiroComPdf) {
        selecionarItemParaLeitura(primeiroComPdf, false);
      }
    }
    if (sessaoId) init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId]);

  // Pré-carrega áudio sempre que mudar de página ou de voz
  useEffect(() => {
    if (itemAtivo && paginas.length > 0) {
      recalcularAudiosProntos(itemAtivo.id, paginas, vozTts);
      if (paginaAtualObj && !paginaAtualObj.pular) {
        prepararAudioEmBackground(itemAtivo.id, paginaAtualObj, vozTts, paginas);
      }
    }
  }, [
    itemAtivo,
    paginas,
    paginaAtualObj,
    vozTts,
    prepararAudioEmBackground,
    recalcularAudiosProntos,
  ]);

  // Renderiza a página do PDF e constrói as linhas ancoradas (Motor Linha a Linha)
  useEffect(() => {
    const seq = ++renderSeqRef.current;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignora cancelamento de renderização anterior
      }
      renderTaskRef.current = null;
    }

    async function renderizarPaginaPdfEConstruirLinhas() {
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
        const urlPdfResolvida = itemAtivo.pdfUrl.replace(
          /^\/uploads\//,
          '/api/arquivos/'
        );
        const loadingTask = window.pdfjsLib.getDocument(urlPdfResolvida);
        const pdfDoc = await loadingTask.promise;
        if (seq !== renderSeqRef.current) return;

        const numPag = Math.min(
          Math.max(1, paginaAtualObj.pagina_real),
          pdfDoc.numPages
        );
        const page = await pdfDoc.getPage(numPag);
        if (seq !== renderSeqRef.current || !canvasRef.current) return;

        const containerWidth =
          viewportContainerRef.current?.clientWidth || 1000;
        const unscaled = page.getViewport({ scale: 1 });
        const larguraAlvo = Math.max(720, Math.min(1120, containerWidth - 48));
        const scale = larguraAlvo / unscaled.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasDim({ width: viewport.width, height: viewport.height });

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const task = page.render({ canvasContext: ctx, viewport });
          renderTaskRef.current = task;
          await task.promise;
          renderTaskRef.current = null;
        }
        if (seq !== renderSeqRef.current) return;

        // Extrai itens de texto do PDF com coordenadas exatas no canvas
        const tc = await page.getTextContent();
        const SIG_RE =
          /assinado\s+digitalmente|documento\s+assinado|icp[-\s]?brasil|autenticidade\s+e\s+integridade|\/verificador|\bverificador\b|\[assinado/i;

        interface RawPdfItem {
          x: number;
          y: number;
          altura: number;
          str: string;
          sig: boolean;
        }

        const raw: RawPdfItem[] = [];
        for (const it of tc.items || []) {
          const s = String(it.str || '');
          if (!s.trim()) continue;
          const tx = window.pdfjsLib.Util.transform(
            viewport.transform,
            it.transform
          );
          if (Math.abs(tx[1]) > Math.abs(tx[0])) continue;
          const altura = Math.max(14, Math.hypot(tx[2], tx[3]) || 18);
          raw.push({
            x: tx[4],
            y: tx[5],
            altura,
            str: s,
            sig: SIG_RE.test(s),
          });
        }

        const sigYs = raw.filter((r) => r.sig).map((r) => r.y);
        if (sigYs.length > 0) {
          const cutoff = Math.min(...sigYs);
          for (let i = raw.length - 1; i >= 0; i--) {
            if (raw[i].y >= cutoff - 2) raw.splice(i, 1);
          }
        }

        raw.sort((a, b) => {
          if (Math.abs(a.y - b.y) <= 6) return a.x - b.x;
          return a.y - b.y;
        });

        const linhasAgrupadas: {
          y: number;
          altura: number;
          partes: string[];
        }[] = [];

        for (const r of raw) {
          const ultima = linhasAgrupadas[linhasAgrupadas.length - 1];
          if (ultima && Math.abs(r.y - ultima.y) <= 7) {
            ultima.partes.push(r.str.trim());
            ultima.altura = Math.max(ultima.altura, r.altura);
          } else {
            linhasAgrupadas.push({
              y: r.y,
              altura: r.altura,
              partes: [r.str.trim()],
            });
          }
        }

        if (linhasAgrupadas.length === 0) {
          linhasPdfRef.current = [];
          setTotalLinhasPagina(0);
          return;
        }

        pageContentBottomYRef.current =
          linhasAgrupadas[linhasAgrupadas.length - 1].y;
        const yMin = linhasAgrupadas[0].y;
        const ySpan = Math.max(1, pageContentBottomYRef.current - yMin);

        const textoFaladoNorm = normalizarTxt(paginaAtualObj.texto || '');
        const ancorasPorLinha: (number | null)[] = new Array(
          linhasAgrupadas.length
        ).fill(null);

        if (textoFaladoNorm.length > 30) {
          let cursor = 0;
          for (let i = 0; i < linhasAgrupadas.length; i++) {
            const textoLinha = linhasAgrupadas[i].partes.join(' ');
            const probe = probeWord(textoLinha);
            if (!probe) continue;
            const idx = textoFaladoNorm.indexOf(probe, cursor);
            if (idx === -1) continue;
            const frac = idx / textoFaladoNorm.length;
            const yFrac = (linhasAgrupadas[i].y - yMin) / ySpan;
            if (frac - yFrac > 0.35) continue;
            cursor = idx + probe.length;
            ancorasPorLinha[i] = frac;
          }
        }

        const tamanhos = linhasAgrupadas.map((l) =>
          Math.max(4, l.partes.join(' ').length)
        );
        const totalCharsLinhas = Math.max(
          1,
          tamanhos.reduce((a, b) => a + b, 0)
        );

        let acum = 0;
        const linhasFinais: LinhaPdfAncorada[] = [];
        for (let i = 0; i < linhasAgrupadas.length; i++) {
          const fracCharInicio = acum / totalCharsLinhas;
          acum += tamanhos[i];
          const fracCharFim = acum / totalCharsLinhas;

          const fracAncora = ancorasPorLinha[i];
          const fracInicio =
            fracAncora !== null
              ? fracAncora * 0.7 + fracCharInicio * 0.3
              : fracCharInicio;

          linhasFinais.push({
            numeroLinha: i + 1,
            canvasY: linhasAgrupadas[i].y,
            altura: linhasAgrupadas[i].altura,
            texto: linhasAgrupadas[i].partes.join(' '),
            fracInicio,
            fracFim: fracCharFim,
          });
        }

        for (let i = 0; i < linhasFinais.length; i++) {
          if (i === 0) {
            linhasFinais[i].fracInicio = 0;
          } else {
            linhasFinais[i].fracInicio = Math.max(
              linhasFinais[i - 1].fracInicio + 0.002,
              Math.min(0.99, linhasFinais[i].fracInicio)
            );
          }
        }
        for (let i = 0; i < linhasFinais.length; i++) {
          linhasFinais[i].fracFim =
            i < linhasFinais.length - 1
              ? linhasFinais[i + 1].fracInicio
              : 1.0;
        }

        linhasPdfRef.current = linhasFinais;
        setTotalLinhasPagina(linhasFinais.length);
        setLinhaAtivaIdx(0);

        if (viewportContainerRef.current) {
          viewportContainerRef.current.scrollTop = 0;
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name?: string }).name === 'RenderingCancelledException'
        ) {
          return;
        }
        console.error('Erro ao renderizar página do PDF:', err);
      }
    }

    renderizarPaginaPdfEConstruirLinhas();

    return () => {
      renderSeqRef.current++;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignora
        }
        renderTaskRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pdfjsPronto,
    itemAtivo?.pdfUrl,
    paginaAtualObj?.pagina_real,
    paginaAtualObj?.texto,
  ]);

  // Configura Web Audio API GainNode para amplificação limpa de voz localmente (quando não mudo)
  function conectarGainNodeSeNecessario() {
    if (!audioRef.current) return;
    audioRef.current.muted = saidaAudio === 'obs';
    if (saidaAudio === 'obs') return;

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
        const source = audioCtxRef.current.createMediaElementSource(
          audioRef.current
        );
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
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Auto-oculta barra superior após 3s de leitura e exibe GC flutuante
  useEffect(() => {
    if (!isPlaying) {
      setBarraTopoVisivel(true);
      setMostrarGcFlutuante(false);
      return;
    }
    const t1 = setTimeout(() => setBarraTopoVisivel(false), 3000);
    const t2 = setTimeout(() => setMostrarGcFlutuante(true), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isPlaying]);

  const converterAudioParaFracTexto = useCallback((progAudio: number): number => {
    const mapa = mapaTempoAtivoRef.current;
    if (!mapa || mapa.length < 2) return progAudio;
    if (progAudio <= mapa[0].fracAudio) return mapa[0].fracTexto;
    const ult = mapa[mapa.length - 1];
    if (progAudio >= ult.fracAudio) return ult.fracTexto;

    for (let i = 1; i < mapa.length; i++) {
      if (progAudio <= mapa[i].fracAudio) {
        const a0 = mapa[i - 1];
        const a1 = mapa[i];
        const span = Math.max(0.0001, a1.fracAudio - a0.fracAudio);
        const t = (progAudio - a0.fracAudio) / span;
        return a0.fracTexto + t * (a1.fracTexto - a0.fracTexto);
      }
    }
    return progAudio;
  }, []);

  const calcularAlvoELinhaAtiva = useCallback(() => {
    const container = viewportContainerRef.current;
    if (!container) return null;

    let progBruto = 0;
    if (usandoFalaNativaRef.current) {
      progBruto = fracFalaNativaRef.current;
    } else {
      const audio = audioRef.current;
      if (!audio || !audio.duration || audio.paused) return null;
      progBruto = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
    }

    const fracTextoReal = usandoFalaNativaRef.current
      ? progBruto
      : converterAudioParaFracTexto(progBruto);

    const f = Math.min(
      1,
      Math.max(0, fracTextoReal / (velocidadeScrollMult || 1))
    );

    const linhas = linhasPdfRef.current;
    if (linhas.length === 0) {
      const maxScroll = Math.max(
        0,
        container.scrollHeight - container.clientHeight
      );
      return {
        pct: Math.round(progBruto * 100),
        idxLinha: 0,
        scrollDesejado: f * maxScroll,
      };
    }

    let idxLinha = 0;
    for (let i = 0; i < linhas.length; i++) {
      if (f >= linhas[i].fracInicio && f <= linhas[i].fracFim) {
        idxLinha = i;
        break;
      }
      if (f > linhas[i].fracFim) {
        idxLinha = i;
      }
    }

    const linhaAtual = linhas[idxLinha];
    let yAlvoCanvas = linhaAtual.canvasY;

    if (modoRolagem === 'continuo' && idxLinha < linhas.length - 1) {
      const proxLinha = linhas[idxLinha + 1];
      const spanLinha = Math.max(
        0.001,
        linhaAtual.fracFim - linhaAtual.fracInicio
      );
      const tLinha = Math.min(
        1,
        Math.max(0, (f - linhaAtual.fracInicio) / spanLinha)
      );
      yAlvoCanvas =
        linhaAtual.canvasY + tLinha * (proxLinha.canvasY - linhaAtual.canvasY);
    }

    const linhaLeituraOffset = container.clientHeight * 0.36;
    const maxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    const scrollDesejado = Math.max(
      0,
      Math.min(maxScroll, yAlvoCanvas + 24 - linhaLeituraOffset)
    );

    return {
      pct: Math.round(progBruto * 100),
      idxLinha,
      scrollDesejado,
    };
  }, [converterAudioParaFracTexto, velocidadeScrollMult, modoRolagem]);

  // Motor Principal de Auto-Scroll Linha a Linha (60fps + Timer em 2º plano)
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    const loopScroll = () => {
      const container = viewportContainerRef.current;
      const calc = calcularAlvoELinhaAtiva();
      if (container && calc) {
        setProgressoAudioPct(calc.pct);
        setLinhaAtivaIdx((prev) =>
          prev !== calc.idxLinha ? calc.idxLinha : prev
        );

        if (!rolagemManualAtiva) {
          const diff = calc.scrollDesejado - container.scrollTop;
          if (Math.abs(diff) < 0.5) {
            container.scrollTop = calc.scrollDesejado;
          } else {
            container.scrollTop += diff * 0.16;
          }
        }
      }
      rafId = requestAnimationFrame(loopScroll);
    };

    rafId = requestAnimationFrame(loopScroll);

    const bgTimer = setInterval(() => {
      if (document.hidden && !rolagemManualAtiva) {
        const container = viewportContainerRef.current;
        const calc = calcularAlvoELinhaAtiva();
        if (container && calc) {
          container.scrollTop = calc.scrollDesejado;
        }
      }
    }, 250);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(bgTimer);
    };
  }, [isPlaying, rolagemManualAtiva, calcularAlvoELinhaAtiva]);

  // Sincronização Master -> Slave contínua (a cada 400ms) com o Telão de Leitura OBS
  useEffect(() => {
    if (!sessaoId || !itemAtivo) return;

    const timer = setInterval(() => {
      enviarSyncImediato();
    }, 400);

    return () => clearInterval(timer);
  }, [sessaoId, itemAtivo, enviarSyncImediato]);

  function pararAudio(notificarObs = true) {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    usandoFalaNativaRef.current = false;
    setIsPlaying(false);
    if (notificarObs) {
      enviarSyncImediato({ isPlaying: false });
    }
  }

  async function tocarPagina(
    idxAlvo: number,
    listaPaginasOverride?: PaginaRoteiro[]
  ) {
    const item = itemAtivoRef.current;
    const listaAtual = listaPaginasOverride || paginasRef.current;
    if (!item || !listaAtual[idxAlvo]) return;
    const pagObj = listaAtual[idxAlvo];

    if (pagObj.pular) {
      if (idxAlvo + 1 < listaAtual.length) {
        setPaginaIdx(idxAlvo + 1);
        paginaIdxRef.current = idxAlvo + 1;
        tocarPagina(idxAlvo + 1, listaAtual);
      }
      return;
    }

    setPaginaIdx(idxAlvo);
    paginaIdxRef.current = idxAlvo;
    setRolagemManualAtiva(false);

    // Opção 1: Voz Nativa do Navegador/Sistema (apenas local)
    if (vozTts.startsWith('nativa:') && 'speechSynthesis' in window) {
      pararAudio(false);
      audioUrlAtivoRef.current = null;
      const nomeVoz = vozTts.replace(/^nativa:/, '');
      const utter = new SpeechSynthesisUtterance(pagObj.texto);
      const vozObj = window.speechSynthesis
        .getVoices()
        .find((v) => v.name === nomeVoz);
      if (vozObj) utter.voice = vozObj;
      utter.lang = vozObj?.lang || 'pt-BR';
      utter.rate = playbackRate;

      const totalLen = Math.max(1, pagObj.texto.length);
      fracFalaNativaRef.current = 0;
      usandoFalaNativaRef.current = true;

      utter.onboundary = (ev) => {
        if (typeof ev.charIndex === 'number') {
          fracFalaNativaRef.current = Math.min(1, ev.charIndex / totalLen);
        }
      };
      utter.onend = () => {
        usandoFalaNativaRef.current = false;
        handleAudioEnded();
      };

      setStatusFeedback(
        `🔊 Lendo Pág. ${pagObj.pagina_real} — Voz Local (${nomeVoz})`
      );
      setIsPlaying(true);
      window.speechSynthesis.speak(utter);
      return;
    }

    // Opção 2: Vozes IA Servidor (Andressa Google Cloud / OpenAI / Google) -> Sai no Telão OBS!
    usandoFalaNativaRef.current = false;
    conectarGainNodeSeNecessario();
    setGerandoAudio(true);
    setStatusFeedback(
      `⏳ Sintetizando voz para a Página ${pagObj.pagina_real}...`
    );

    try {
      const dadosAudio = await prepararAudioEmBackground(
        item.id,
        pagObj,
        vozTts,
        listaAtual
      );

      if (!dadosAudio || !dadosAudio.audioUrl) {
        setStatusFeedback('⚠️ Falha ao gerar áudio TTS para esta página.');
        setGerandoAudio(false);
        return;
      }

      mapaTempoAtivoRef.current = dadosAudio.mapaTempo;
      audioUrlAtivoRef.current = dadosAudio.audioUrl;

      const sufixoObs =
        saidaAudio === 'obs'
          ? ' • 📺 Saindo no Telão OBS (Mudo aqui)'
          : saidaAudio === 'ambos'
            ? ' • 📺 Sincronizado com Telão OBS'
            : '';

      const labelProvedor =
        dadosAudio.provedor === 'openai'
          ? `🔊 Voz Neural OpenAI (${dadosAudio.vozUsada}) — Pág. ${pagObj.pagina_real}${sufixoObs}`
          : dadosAudio.provedor === 'gcloud'
            ? `🔊 ${
                dadosAudio.vozUsada === 'gcloud:pt-BR-Standard-D'
                  ? 'Andressa'
                  : dadosAudio.vozUsada.replace('gcloud:', '')
              } (Google Cloud) — Pág. ${pagObj.pagina_real}${sufixoObs}`
            : `🔊 Voz Google (${dadosAudio.vozUsada}) — Pág. ${pagObj.pagina_real}${sufixoObs}`;
      setStatusFeedback(labelProvedor);

      if (audioRef.current) {
        audioRef.current.muted = saidaAudio === 'obs';
        audioRef.current.src = dadosAudio.audioUrl;
        audioRef.current.playbackRate = playbackRate;
        await audioRef.current.play();
        setIsPlaying(true);
        enviarSyncImediato({
          isPlaying: true,
          audioUrl: dadosAudio.audioUrl,
          pagina: pagObj.pagina_real,
          currentTime: 0,
        });
      }

      // Pré-carrega em background o áudio da próxima página legível
      const proxIdx = listaAtual.findIndex((p, i) => i > idxAlvo && !p.pular);
      if (proxIdx !== -1) {
        prepararAudioEmBackground(
          item.id,
          listaAtual[proxIdx],
          vozTts,
          listaAtual
        );
      }
    } catch (err) {
      console.error('Erro ao reproduzir áudio:', err);
      setStatusFeedback(
        '⚠️ Clique novamente em "Ler Página" para liberar o controle de reprodução.'
      );
    } finally {
      setGerandoAudio(false);
    }
  }

  function handlePlayPause() {
    if (isPlaying) {
      pararAudio(true);
      return;
    }

    // Só retoma o <audio> atual se o src corresponder exatamente ao audioUrlAtivoRef da página atual
    const pagAtual = paginasRef.current[paginaIdxRef.current];
    const chaveEsperada =
      itemAtivoRef.current && pagAtual
        ? `${itemAtivoRef.current.id}_${pagAtual.pagina_real}_${vozTts}_${hashTextoRapido(
            (pagAtual.texto || '').trim()
          )}`
        : '';
    const cachePaginaAtual = chaveEsperada
      ? cacheAudioPaginasRef.current[chaveEsperada]
      : null;

    if (
      !vozTts.startsWith('nativa:') &&
      audioRef.current &&
      audioUrlAtivoRef.current &&
      cachePaginaAtual?.audioUrl === audioUrlAtivoRef.current &&
      audioRef.current.currentTime > 0 &&
      !audioRef.current.ended
    ) {
      conectarGainNodeSeNecessario();
      audioRef.current.play();
      setIsPlaying(true);
      enviarSyncImediato({
        isPlaying: true,
        audioUrl: audioUrlAtivoRef.current,
        currentTime: audioRef.current.currentTime,
      });
    } else {
      tocarPagina(paginaIdxRef.current);
    }
  }

  function handleAudioEnded() {
    setIsPlaying(false);
    const listaAtual = paginasRef.current;
    const idxAtual = paginaIdxRef.current;
    const proxIdx = listaAtual.findIndex((p, i) => i > idxAtual && !p.pular);
    if (proxIdx !== -1) {
      setPaginaIdx(proxIdx);
      paginaIdxRef.current = proxIdx;
      setLinhaAtivaIdx(0);
      setRolagemManualAtiva(false);
      setTimeout(() => tocarPagina(proxIdx, listaAtual), 300);
    } else {
      enviarSyncImediato({ isPlaying: false });
      setStatusFeedback('✅ Leitura do documento concluída!');
    }
  }

  // Funções do Modal de Preparação do Roteiro (#modal-prep — Lado a Lado PDF + Editor)
  function pararPreviaModal() {
    if (audioPreviaModalRef.current) {
      audioPreviaModalRef.current.pause();
    }
    setOuvindoPreviaModal(false);
  }

  function fecharModalPreparacao() {
    pararPreviaModal();
    setModalAberto(false);
    modalPrepRef.current?.close();
  }

  function abrirModalPreparacao() {
    pararAudio(true);
    pararPreviaModal();
    setAvisoModalPrep('');
    const copia = paginasRef.current.map((p) => ({ ...p }));
    setPaginasEdicao(copia);
    const idxInicial = Math.min(
      Math.max(0, paginaIdxRef.current),
      Math.max(0, copia.length - 1)
    );
    setPaginaModalIdx(idxInicial);
    setModalAberto(true);
    modalPrepRef.current?.showModal();
  }

  async function handleOuvirPreviaPaginaModal(pagAlvo: PaginaRoteiro) {
    if (!itemAtivo || !pagAlvo.texto.trim()) return;
    if (ouvindoPreviaModal) {
      pararPreviaModal();
      return;
    }
    setGerandoPreviaModal(true);
    try {
      const dados = await prepararAudioEmBackground(
        itemAtivo.id,
        pagAlvo,
        vozTts.startsWith('nativa:') ? 'gcloud:pt-BR-Standard-D' : vozTts,
        paginasEdicao
      );
      if (dados?.audioUrl && audioPreviaModalRef.current) {
        audioPreviaModalRef.current.src = dados.audioUrl;
        audioPreviaModalRef.current.playbackRate = playbackRate;
        await audioPreviaModalRef.current.play();
        setOuvindoPreviaModal(true);
      }
    } finally {
      setGerandoPreviaModal(false);
    }
  }

  // Renderiza a página correspondente do PDF ao lado esquerdo do Modal de Preparação
  const numPagRealModal = paginasEdicao[paginaModalIdx]?.pagina_real || 1;
  useEffect(() => {
    if (
      !modalAberto ||
      !pdfjsPronto ||
      !window.pdfjsLib ||
      !itemAtivo?.pdfUrl
    ) {
      return;
    }

    const seq = ++modalRenderSeqRef.current;
    if (modalRenderTaskRef.current) {
      try {
        modalRenderTaskRef.current.cancel();
      } catch {
        // Ignora
      }
      modalRenderTaskRef.current = null;
    }

    const timer = requestAnimationFrame(async () => {
      try {
        const canvas = canvasModalRef.current;
        const container = containerModalPdfRef.current;
        if (!canvas || !container || !itemAtivo?.pdfUrl) return;

        const urlPdfResolvida = itemAtivo.pdfUrl.replace(
          /^\/uploads\//,
          '/api/arquivos/'
        );
        const loadingTask = window.pdfjsLib.getDocument(urlPdfResolvida);
        const pdfDoc = await loadingTask.promise;
        if (seq !== modalRenderSeqRef.current) return;

        const pagNum = Math.min(Math.max(1, numPagRealModal), pdfDoc.numPages);
        const page = await pdfDoc.getPage(pagNum);
        if (seq !== modalRenderSeqRef.current || !canvasModalRef.current) return;

        const larguraUtil = Math.max(420, (container.clientWidth || 680) - 32);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = (larguraUtil / unscaled.width) * zoomPdfModal;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const task = page.render({ canvasContext: ctx, viewport });
          modalRenderTaskRef.current = task;
          await task.promise;
          modalRenderTaskRef.current = null;
        }
        container.scrollTop = 0;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name?: string }).name === 'RenderingCancelledException'
        ) {
          return;
        }
        console.error('Erro ao renderizar PDF no modal lado a lado:', err);
      }
    });

    return () => {
      cancelAnimationFrame(timer);
      modalRenderSeqRef.current++;
      if (modalRenderTaskRef.current) {
        try {
          modalRenderTaskRef.current.cancel();
        } catch {
          // Ignora
        }
        modalRenderTaskRef.current = null;
      }
    };
  }, [
    modalAberto,
    pdfjsPronto,
    itemAtivo?.pdfUrl,
    numPagRealModal,
    zoomPdfModal,
  ]);

  async function handleSalvarChaveGeminiRapido() {
    if (!chaveGeminiModal.trim()) return;
    setSalvandoChaveIaModal(true);
    setAvisoModalPrep('');
    try {
      const testRes = await fetch('/api/vereadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'testar_gemini',
          chave: chaveGeminiModal.trim(),
        }),
      });
      const testData = await testRes.json();
      if (!testRes.ok || !testData.ok) {
        setAvisoModalPrep(`❌ ${testData.error || 'Chave Gemini inválida.'}`);
        return;
      }

      const saveRes = await fetch('/api/vereadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvar_gemini',
          chave: chaveGeminiModal.trim(),
        }),
      });
      if (saveRes.ok) {
        setIaStatus((prev) => ({ ...prev, geminiAtivo: true }));
        setChaveGeminiModal('');
        setMostrarConfigIaModal(false);
        setAvisoModalPrep(
          '✅ Chave Google Gemini salva! Agora clique em "✨ Revisar PDF e Tabelas com IA".'
        );
      }
    } finally {
      setSalvandoChaveIaModal(false);
    }
  }

  async function handleRevisarIaNoModal() {
    if (!itemAtivo) return;
    setRevisandoIaModal(true);
    setAvisoModalPrep(
      iaStatus.geminiAtivo
        ? '🧠 O Google Gemini está analisando visualmente o PDF (convertendo tabelas em prosa, removendo tachados e ajustando números)...'
        : iaStatus.openaiAtivo
          ? '🧠 A OpenAI está revisando as formatações, tabelas e números para leitura...'
          : '⚙️ Aplicando limpeza legislativa automática (43/2026 -> 43 de 2026, remoção de [assinado digitalmente], datas e incisos)...'
    );
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
          if (data.provedorIa === 'gemini-pdf') {
          setAvisoModalPrep(
            '✅ PDF revisado visualmente pelo Google Gemini! Tabelas, tachados e números foram convertidos. Confira e clique em "Salvar e Gerar Novos Áudios".'
          );
        } else if (
          data.provedorIa === 'gemini-texto' ||
          data.provedorIa === 'openai'
        ) {
          setAvisoModalPrep(
            '✅ Texto revisado com IA! Confira e clique em "Salvar e Gerar Áudios".'
          );
        } else {
          setAvisoModalPrep(
            '✅ Regras automáticas aplicadas (números/ano sem "avos", datas e remoção de assinaturas). Dica: para converter TABELAS complexas do PDF em texto corrido, clique em "Configurar IA Gratuita (Gemini)".'
          );
        }
      }
    } finally {
      setRevisandoIaModal(false);
    }
  }

  async function handleRecarregarOriginalDoPdf() {
    if (!itemAtivo) return;
    const q = `/api/sessoes/${sessaoId}/leitura?pautaId=${itemAtivo.id}&ignoreCache=1`;
    const res = await fetch(q, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && Array.isArray(data.paginas)) {
      setPaginasEdicao(data.paginas);
      setAvisoModalPrep(
        '🔄 Texto original extraído novamente do PDF com limpeza automática aplicada. Clique em "Salvar e Gerar Áudios" para aplicar.'
      );
    }
  }

  async function handleSalvarEGerarAudiosModal(e: React.FormEvent) {
    e.preventDefault();
    if (!itemAtivo) return;
    setSalvandoModal(true);

    try {
      pararAudio(true);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      audioUrlAtivoRef.current = null;

      const paginasLimpas: PaginaRoteiro[] = paginasEdicao.map((p) => ({
        pagina_real: p.pagina_real,
        texto: (p.texto || '').trim(),
        pular: Boolean(p.pular),
        audio_url: null,
      }));

      const res = await fetch(`/api/sessoes/${sessaoId}/leitura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvar_roteiro',
          pautaId: itemAtivo.id,
          paginas: paginasLimpas,
        }),
      });

      if (res.ok) {
        const novaVersao = ++versaoRoteiroRef.current;
        cacheAudioPaginasRef.current = {};
        setAudiosProntosCount(0);

        // Atualiza tanho o state quanto a ref imediatamente para não usar texto antigo!
        paginasRef.current = paginasLimpas;
        setPaginas(paginasLimpas);
        setItens((prev) =>
          prev.map((i) =>
            i.id === itemAtivo.id ? { ...i, jaRevisado: true } : i
          )
        );

        fecharModalPreparacao();

        const primeiraValida = paginasLimpas.findIndex(
          (p) => !p.pular && p.texto.length > 0
        );
        const alvo = primeiraValida >= 0 ? primeiraValida : 0;
        setPaginaIdx(alvo);
        paginaIdxRef.current = alvo;

        // Gera e já inicia com o NOVO texto editado + dispara geração das demais páginas em background
        await tocarPagina(alvo, paginasLimpas);
        gerarTodosAudiosBackground(
          itemAtivo.id,
          paginasLimpas,
          vozTts,
          novaVersao
        );
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

  const linhaAtivaObj = linhasPdfRef.current[linhaAtivaIdx] || null;
  const totalPaginasLegiveis = paginas.filter(
    (p) => !p.pular && (p.texto || '').trim().length > 0
  ).length;

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

      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />

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
              corBadge =
                'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
            else if (it.votacaoEtapa === 'Primeira Votação')
              corBadge =
                'bg-blue-500/20 text-blue-300 border border-blue-500/30';
            else if (it.votacaoEtapa === 'Segunda Votação')
              corBadge =
                'bg-amber-500/20 text-amber-300 border border-amber-500/30';

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
                    {it.pdfUrl && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        📄 PDF
                      </span>
                    )}
                    {it.jaRevisado && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                        ✨ IA
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${corBadge}`}
                    >
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
                  pararAudio(true);
                  const novo = Math.max(0, paginaIdx - 1);
                  setPaginaIdx(novo);
                  paginaIdxRef.current = novo;
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
                    <span>{gerandoAudio ? 'Gerando Voz...' : 'Ler Página'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={paginaIdx >= paginas.length - 1}
                onClick={() => {
                  pararAudio(true);
                  const novo = Math.min(paginas.length - 1, paginaIdx + 1);
                  setPaginaIdx(novo);
                  paginaIdxRef.current = novo;
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

            {totalPaginasLegiveis > 0 && !vozTts.startsWith('nativa:') && (
              <span
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold tabular-nums border ${
                  audiosProntosCount >= totalPaginasLegiveis
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
                title="Quantidade de páginas com arquivo de áudio pronto"
              >
                🔊 {audiosProntosCount}/{totalPaginasLegiveis} prontos
              </span>
            )}
          </div>

          {/* Seletores de Saída OBS, Voz, Velocidade, Rolagem e Ganho */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="Onde reproduzir o áudio"
              value={saidaAudio}
              onChange={(e) => setSaidaAudio(e.target.value as ModoSaidaAudio)}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-cyan-500/50 text-cyan-200 font-bold"
              title="Defina se o som sai no link do Telão OBS, neste PC ou em ambos"
            >
              <option value="ambos">🔊 Som: Telão OBS + Este PC</option>
              <option value="obs">📺 Som: Só no Telão OBS (Mudo aqui)</option>
              <option value="local">💻 Som: Só neste PC</option>
            </select>

            <select
              aria-label="Selecionar Voz TTS"
              value={vozTts}
              onChange={(e) => {
                pararAudio(true);
                setVozTts(e.target.value);
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-emerald-500/40 text-slate-100 font-bold max-w-[240px]"
            >
              <optgroup label="☁️ Google Cloud (credencial da Câmara — Sai no OBS)">
                <option value="gcloud:pt-BR-Standard-D">⭐ Andressa (Padrão)</option>
                <option value="gcloud:pt-BR-Wavenet-D">Wavenet D (Feminina Natural)</option>
                <option value="gcloud:pt-BR-Neural2-A">Neural2 A (Feminina Neural)</option>
                <option value="gcloud:pt-BR-Neural2-C">Neural2 C (Feminina Neural)</option>
                <option value="gcloud:pt-BR-Wavenet-A">Wavenet A (Feminina)</option>
                <option value="gcloud:pt-BR-Wavenet-C">Wavenet C (Feminina)</option>
                <option value="gcloud:pt-BR-Standard-A">Standard A (Feminina)</option>
                <option value="gcloud:pt-BR-Neural2-B">Neural2 B (Masculina Neural)</option>
                <option value="gcloud:pt-BR-Wavenet-B">Wavenet B (Masculina)</option>
                <option value="gcloud:pt-BR-Wavenet-E">Wavenet E (Masculina)</option>
              </optgroup>
              <optgroup label="🆓 Vozes Gratuitas Google (Reserva — Sai no OBS)">
                <option value="google-feminina">🌐 Google Feminina Brasil (Fluida)</option>
                <option value="google-solene">🌐 Google Feminina Brasil (Solene)</option>
                <option value="google-clara">🌐 Google Feminina Brasil (Clara GTX)</option>
                <option value="google-pt">🌐 Google Feminina Clássica (Português)</option>
              </optgroup>

              <optgroup label="🔑 Vozes OpenAI Neural (Requer Chave — Sai no OBS)">
                <option value="nova">✨ Nova (Feminina Dinâmica)</option>
                <option value="shimmer">✨ Shimmer (Feminina Clara)</option>
                <option value="coral">✨ Coral (Feminina Expressiva)</option>
                <option value="sage">✨ Sage (Feminina Institucional)</option>
                <option value="onyx">✨ Onyx (Masculina Grave)</option>
                <option value="echo">✨ Echo (Masculina Suave)</option>
                <option value="alloy">✨ Alloy (Neutra)</option>
              </optgroup>

              {vozesNativasPt.length > 0 && (
                <optgroup label="💻 Vozes Locais deste Navegador (Não saem no OBS)">
                  {vozesNativasPt.map((v) => (
                    <option key={v.name} value={`nativa:${v.name}`}>
                      🗣️ {v.name} (Apenas local)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <select
              aria-label="Velocidade da Fala"
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold tabular-nums"
            >
              <option value={0.95}>Fala: 0.95x</option>
              <option value={1.0}>Fala: 1.00x (Padrão)</option>
              <option value={1.1}>Fala: 1.10x</option>
              <option value={1.15}>Fala: 1.15x</option>
              <option value={1.2}>Fala: 1.20x</option>
              <option value={1.25}>Fala: 1.25x</option>
            </select>

            <select
              aria-label="Modo de Rolagem"
              value={modoRolagem}
              onChange={(e) =>
                setModoRolagem(e.target.value as 'linha' | 'continuo')
              }
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-blue-500/40 text-blue-200 font-bold"
            >
              <option value="linha">📑 Rolagem: Pular Linha a Linha</option>
              <option value="continuo">🌊 Rolagem: Contínua Suave</option>
            </select>

            <select
              aria-label="Ajuste Fino de Rolagem"
              value={velocidadeScrollMult}
              onChange={(e) => setVelocidadeScrollMult(Number(e.target.value))}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold"
            >
              <option value={1.12}>Sincronia: -12%</option>
              <option value={1.0}>Sincronia: 100% (Exata)</option>
              <option value={0.9}>Sincronia: +10%</option>
              <option value={0.8}>Sincronia: +20%</option>
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
              title="Abrir Telão de Leitura com Vídeo + Áudio sincronizados para captura no OBS Studio"
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

        {/* GC Flutuante ("Em Leitura" + Linha Atual) */}
        {mostrarGcFlutuante && itemAtivo && (
          <div className="fixed top-20 left-8 z-40 bg-white/95 text-slate-900 border-l-8 border-blue-700 rounded-xl shadow-2xl px-5 py-3 max-w-md pointer-events-none animate-in fade-in slide-in-from-left-6 duration-500">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">
              🔊 Em Leitura — Pág. {paginaAtualObj?.pagina_real || 1} • Linha{' '}
              {Math.min(linhaAtivaIdx + 1, Math.max(1, totalLinhasPagina))}/
              {Math.max(1, totalLinhasPagina)} ({progressoAudioPct}%)
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

        {/* Área Central de Exibição do Documento PDF com Guia Visual Linha a Linha */}
        <div
          ref={viewportContainerRef}
          onWheel={() => {
            if (isPlaying) setRolagemManualAtiva(true);
          }}
          onTouchMove={() => {
            if (isPlaying) setRolagemManualAtiva(true);
          }}
          className="flex-1 overflow-y-auto px-6 pt-6 pb-[55vh] block relative"
        >
          {statusFeedback && (
            <div className="max-w-3xl mx-auto mb-4 px-4 py-2 rounded-full bg-slate-800/95 border border-slate-700 text-xs font-bold text-blue-300 flex items-center justify-between gap-3 shadow-md">
              <span className="truncate">{statusFeedback}</span>
              {totalLinhasPagina > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 tabular-nums">
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>
                    Linha {Math.min(linhaAtivaIdx + 1, totalLinhasPagina)} de{' '}
                    {totalLinhasPagina} ({progressoAudioPct}%)
                  </span>
                </span>
              )}
            </div>
          )}

          {itemAtivo?.pdfUrl ? (
            <div
              className="relative mx-auto shadow-2xl rounded-xl overflow-hidden bg-white"
              style={{
                width: canvasDim.width > 0 ? `${canvasDim.width}px` : 'auto',
                height: canvasDim.height > 0 ? `${canvasDim.height}px` : 'auto',
              }}
            >
              <canvas ref={canvasRef} className="block" />

              {linhaAtivaObj && (
                <div
                  style={{
                    top: `${Math.max(
                      0,
                      linhaAtivaObj.canvasY - linhaAtivaObj.altura * 0.85
                    )}px`,
                    height: `${Math.max(24, linhaAtivaObj.altura * 1.4)}px`,
                  }}
                  className="absolute left-0 right-0 pointer-events-none transition-all duration-200 bg-amber-300/30 border-l-[6px] border-blue-600 shadow-sm flex items-center justify-end pr-3"
                >
                  <span className="px-2 py-0.5 rounded bg-blue-700/90 text-white text-[10px] font-black uppercase tracking-wider shadow">
                    Linha {linhaAtivaObj.numeroLinha}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 space-y-6 my-8">
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

      {/* Modal <dialog> Lado a Lado: PDF Original (Esquerda) + Editor de Leitura (Direita) */}
      <dialog
        ref={modalPrepRef}
        aria-labelledby="modal-prep-title"
        onClose={() => {
          pararPreviaModal();
          setModalAberto(false);
        }}
        onClick={(e) => {
          const dlg = modalPrepRef.current;
          if (!dlg) return;
          const r = dlg.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          ) {
            fecharModalPreparacao();
          }
        }}
        className="rounded-3xl p-0 backdrop:bg-slate-950/80 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 w-[96vw] max-w-[1680px] h-[92vh] m-auto overflow-hidden"
      >
        <audio
          ref={audioPreviaModalRef}
          onEnded={() => setOuvindoPreviaModal(false)}
          className="hidden"
        />

        <form
          onSubmit={handleSalvarEGerarAudiosModal}
          className="flex flex-col h-full p-4 sm:p-6 gap-3.5"
        >
          {/* Cabeçalho Compacto do Estúdio Lado a Lado */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3 shrink-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="modal-prep-title"
                  className="text-lg sm:text-xl font-extrabold text-white"
                >
                  ✨ Preparação Lado a Lado — {itemAtivo?.titulo}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    iaStatus.geminiAtivo
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : iaStatus.openaiAtivo
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {iaStatus.geminiAtivo
                    ? '✓ Gemini PDF Vision Ativo'
                    : iaStatus.openaiAtivo
                      ? '✓ OpenAI Ativo'
                      : 'Regras Automáticas Ativas'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Compare o documento original à esquerda com o texto falado à direita. Ao
                trocar de página ou clicar em um trecho, o PDF acompanha automaticamente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!iaStatus.geminiAtivo && (
                <button
                  type="button"
                  onClick={() => setMostrarConfigIaModal((v) => !v)}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Configurar IA Gratuita (Gemini)</span>
                </button>
              )}

              <button
                type="button"
                disabled={revisandoIaModal}
                onClick={handleRevisarIaNoModal}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {revisandoIaModal
                    ? 'Revisando PDF com IA...'
                    : iaStatus.geminiAtivo
                      ? '✨ Revisar PDF e Tabelas com IA'
                      : '✨ Revisar Formatações'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleRecarregarOriginalDoPdf}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Recarregar do PDF</span>
              </button>
            </div>
          </div>

          {/* Painel Rápido para ativar Google Gemini Gratuito */}
          {mostrarConfigIaModal && (
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/40 space-y-2.5 shrink-0">
              <p className="text-xs text-slate-300 leading-relaxed">
                Gere uma chave gratuita em{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-300 underline font-bold"
                >
                  aistudio.google.com/apikey
                </a>{' '}
                (começa com <code className="text-amber-200">AQ...</code> ou{' '}
                <code className="text-amber-200">AIza...</code>) e cole abaixo:
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={chaveGeminiModal}
                  onChange={(e) => setChaveGeminiModal(e.target.value)}
                  placeholder="AQ... ou AIzaSy..."
                  aria-label="Chave da API Google Gemini"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  disabled={salvandoChaveIaModal || !chaveGeminiModal.trim()}
                  onClick={handleSalvarChaveGeminiRapido}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {salvandoChaveIaModal ? 'Validando...' : 'Validar e Ativar Gemini'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {avisoModalPrep && (
            <div
              role="status"
              aria-live="polite"
              className="px-3.5 py-2.5 rounded-xl bg-blue-950/70 border border-blue-500/40 text-xs font-semibold text-blue-200 shrink-0"
            >
              {avisoModalPrep}
            </div>
          )}

          {/* Barra Unificada de Navegação de Páginas (sincroniza PDF + Editor) */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-2xl px-3 py-2 shrink-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={paginaModalIdx <= 0}
                onClick={() => {
                  pararPreviaModal();
                  setPaginaModalIdx((p) => Math.max(0, p - 1));
                }}
                aria-label="Página anterior no comparador"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex flex-wrap items-center gap-1">
                {paginasEdicao.map((p, idx) => {
                  const selecionada = idx === paginaModalIdx;
                  return (
                    <button
                      key={p.pagina_real}
                      type="button"
                      onClick={() => {
                        pararPreviaModal();
                        setPaginaModalIdx(idx);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1 tabular-nums ${
                        selecionada
                          ? 'bg-blue-600 text-white shadow-md'
                          : p.pular
                            ? 'bg-red-950/50 text-red-300/80 border border-red-900/40 line-through'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <span>Pág. {p.pagina_real}</span>
                      {p.pular && <span title="Marcada para não ler">🚫</span>}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={paginaModalIdx >= paginasEdicao.length - 1}
                onClick={() => {
                  pararPreviaModal();
                  setPaginaModalIdx((p) =>
                    Math.min(paginasEdicao.length - 1, p + 1)
                  );
                }}
                aria-label="Próxima página no comparador"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Alternador Página Focada vs Lista Completa + Zoom do PDF */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {itemAtivo?.pdfUrl && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setZoomPdfModal((z) =>
                        Math.max(0.75, Number((z - 0.15).toFixed(2)))
                      )
                    }
                    aria-label="Diminuir zoom do PDF"
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-bold text-slate-300 tabular-nums">
                    {Math.round(zoomPdfModal * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setZoomPdfModal((z) =>
                        Math.min(1.75, Number((z + 0.15).toFixed(2)))
                      )
                    }
                    aria-label="Aumentar zoom do PDF"
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setModoVisaoModal('focada')}
                  className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer ${
                    modoVisaoModal === 'focada'
                      ? 'bg-blue-600/30 text-blue-200 border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Página a Página</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoVisaoModal('lista')}
                  className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer ${
                    modoVisaoModal === 'lista'
                      ? 'bg-blue-600/30 text-blue-200 border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Rows3 className="w-3.5 h-3.5" />
                  <span>Todas em Lista</span>
                </button>
              </div>
            </div>
          </div>

          {/* ÁREA PRINCIPAL LADO A LADO (50% PDF Original | 50% Editor do Áudio) */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
            {/* COLUNA ESQUERDA: Visualizador do Documento PDF Original */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-slate-800 bg-slate-950/80 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs shrink-0">
                <span className="font-extrabold text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>
                    Documento PDF Original — Página {numPagRealModal} de{' '}
                    {paginasEdicao.length || 1}
                  </span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Referência visual
                </span>
              </div>

              <div
                ref={containerModalPdfRef}
                className="flex-1 overflow-auto p-4 block"
              >
                {itemAtivo?.pdfUrl ? (
                  <canvas
                    ref={canvasModalRef}
                    className="block mx-auto shadow-xl rounded-lg bg-white"
                  />
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-slate-300">
                    <p className="text-xs font-bold uppercase text-blue-400">
                      Item sem arquivo PDF (Ementa Original)
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {itemAtivo?.ementa || itemAtivo?.titulo || ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA DIREITA: Editor do Texto que será Convertido em Áudio */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              {modoVisaoModal === 'focada' && paginasEdicao[paginaModalIdx] ? (
                (() => {
                  const pagFocada = paginasEdicao[paginaModalIdx];
                  return (
                    <div className="flex flex-col h-full min-h-0">
                      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-extrabold text-emerald-400">
                            🎙️ Texto do Áudio — Página {pagFocada.pagina_real}
                          </span>
                          <button
                            type="button"
                            disabled={
                              Boolean(pagFocada.pular) ||
                              gerandoPreviaModal ||
                              !pagFocada.texto.trim()
                            }
                            onClick={() => handleOuvirPreviaPaginaModal(pagFocada)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                              ouvindoPreviaModal
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-blue-600/25 hover:bg-blue-600/40 text-blue-200 border border-blue-500/30 disabled:opacity-40'
                            }`}
                          >
                            {ouvindoPreviaModal ? (
                              <>
                                <Square className="w-3 h-3 fill-current" />
                                <span>Parar Prévia</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>
                                  {gerandoPreviaModal
                                    ? 'Gerando...'
                                    : 'Ouvir Prévia'}
                                </span>
                              </>
                            )}
                          </button>
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs font-bold text-red-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(pagFocada.pular)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (checked) pararPreviaModal();
                              setPaginasEdicao((prev) =>
                                prev.map((x, i) =>
                                  i === paginaModalIdx
                                    ? { ...x, pular: checked }
                                    : x
                                )
                              );
                            }}
                            className="w-4 h-4 accent-red-600 rounded"
                          />
                          <Ban className="w-3.5 h-3.5" />
                          <span>🚫 Não ler esta página</span>
                        </label>
                      </div>

                      <div className="flex-1 p-3 flex flex-col min-h-0">
                        <textarea
                          disabled={Boolean(pagFocada.pular)}
                          value={pagFocada.texto}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (ouvindoPreviaModal) pararPreviaModal();
                            setPaginasEdicao((prev) =>
                              prev.map((x, i) =>
                                i === paginaModalIdx
                                  ? { ...x, texto: val, audio_url: null }
                                  : x
                              )
                            );
                          }}
                          aria-label={`Texto de leitura da Página ${pagFocada.pagina_real}`}
                          placeholder="Digite ou edite aqui exatamente o que a voz da IA deve ler nesta página..."
                          className={`flex-1 w-full resize-none p-4 rounded-xl bg-slate-950 border text-base text-slate-100 leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            pagFocada.pular
                              ? 'border-red-900/50 opacity-50 line-through'
                              : 'border-slate-700'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {paginasEdicao.map((p, idx) => {
                    const ativa = idx === paginaModalIdx;
                    return (
                      <div
                        key={p.pagina_real}
                        onClick={() => {
                          if (paginaModalIdx !== idx) {
                            pararPreviaModal();
                            setPaginaModalIdx(idx);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          p.pular
                            ? 'bg-slate-950/60 border-red-900/50 opacity-60'
                            : ativa
                              ? 'bg-slate-800/95 border-blue-500 ring-2 ring-blue-500/30'
                              : 'bg-slate-900/80 border-slate-700/80 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <span className="text-sm font-extrabold text-blue-400">
                            Página {p.pagina_real}{' '}
                            {ativa && (
                              <span className="text-[11px] font-bold text-emerald-400 ml-1">
                                (Exibida no PDF ao lado)
                              </span>
                            )}
                          </span>

                          <label className="inline-flex items-center gap-2 text-xs font-bold text-red-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(p.pular)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPaginasEdicao((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, pular: checked } : x
                                  )
                                );
                              }}
                              className="w-4 h-4 accent-red-600 rounded"
                            />
                            <Ban className="w-3.5 h-3.5" />
                            <span>🚫 Não ler esta página</span>
                          </label>
                        </div>

                        <textarea
                          rows={6}
                          disabled={Boolean(p.pular)}
                          value={p.texto}
                          onFocus={() => {
                            if (paginaModalIdx !== idx) {
                              pararPreviaModal();
                              setPaginaModalIdx(idx);
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPaginasEdicao((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, texto: val, audio_url: null }
                                  : x
                              )
                            );
                          }}
                          aria-label={`Texto de leitura da Página ${p.pagina_real}`}
                          className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Rodapé Fixo de Ações */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800 shrink-0">
            <span className="text-xs text-slate-400 hidden sm:inline">
              Dica: Você pode ouvir uma prévia rápida da página atual ou salvar para gerar
              todos os áudios atualizados.
            </span>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={fecharModalPreparacao}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={salvandoModal}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold flex items-center gap-2 cursor-pointer shadow-lg"
              >
                {salvandoModal ? (
                  <span>Salvando e Gerando Novo Áudio...</span>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>💾 Salvar e Gerar Novos Áudios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}
