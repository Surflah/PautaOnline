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

  // Vozes gratuitas selecionadas por padrão (Google Feminina Brasil)
  const [vozTts, setVozTts] = useState('google-feminina');
  const [vozesNativasPt, setVozesNativasPt] = useState<VozNativaSistema[]>([]);
  const [playbackRate, setPlaybackRate] = useState(1.1);
  const [velocidadeScrollMult, setVelocidadeScrollMult] = useState(1.0); // 1.0 = Sincronia exata com a fala
  const [modoRolagem, setModoRolagem] = useState<'linha' | 'continuo'>('linha');
  const [volumeBoost, setVolumeBoost] = useState(1.7);

  // Estado de Reprodução e Auto-Scroll Linha a Linha
  const [isPlaying, setIsPlaying] = useState(false);
  const [gerandoAudio, setGerandoAudio] = useState(false);
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

  // Cache de áudios e mapas de tempo por página/voz
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

      const primeiroComPdf =
        lista.find((i) => Boolean(i.pdfUrl)) || lista[0] || null;
      if (primeiroComPdf) {
        selecionarItemParaLeitura(primeiroComPdf, false);
      }
    }
    if (sessaoId) init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId]);

  const prepararAudioEmBackground = useCallback(
    async (pautaId: number, pag: PaginaRoteiro, voz: string) => {
      if (!pag || pag.pular || voz.startsWith('nativa:')) return null;
      const chaveCache = `${pautaId}_${pag.pagina_real}_${voz}_${pag.texto.length}`;
      if (cacheAudioPaginasRef.current[chaveCache]) {
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
            texto: pag.texto,
            voz,
          }),
        });
        const data = await res.json();
        if (res.ok && data.audioUrl) {
          const entrada = {
            audioUrl: data.audioUrl,
            provedor: data.provedor || 'google',
            vozUsada: data.vozUsada || voz,
            mapaTempo: Array.isArray(data.mapaTempo)
              ? data.mapaTempo
              : [
                  { fracAudio: 0, fracTexto: 0 },
                  { fracAudio: 1, fracTexto: 1 },
                ],
          };
          cacheAudioPaginasRef.current[chaveCache] = entrada;
          return entrada;
        }
      } catch {
        // Ignora erro de pré-carga
      }
      return null;
    },
    [sessaoId]
  );

  const selecionarItemParaLeitura = useCallback(
    async (item: PautaItemLeitura, ignoreCache = false) => {
      pararAudio();
      setItemAtivo(item);
      setPaginas([]);
      setPaginaIdx(0);
      setLinhaAtivaIdx(0);
      setRolagemManualAtiva(false);
      setProgressoAudioPct(0);
      setStatusFeedback('Carregando documento e extraindo linhas para leitura...');

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
        const idxInicial = primeiraNaoPulada >= 0 ? primeiraNaoPulada : 0;
        setPaginaIdx(idxInicial);
        setStatusFeedback(
          `Documento pronto (${data.paginas.length} pág.). Clique em "Ler Página" para iniciar.`
        );

        // Pré-gera imediatamente o áudio da 1ª página legível para início instantâneo
        if (data.paginas[idxInicial]) {
          prepararAudioEmBackground(
            item.id,
            data.paginas[idxInicial],
            vozTts
          );
        }
      }
    },
    [sessaoId, vozTts, prepararAudioEmBackground]
  );

  // Pré-carrega áudio sempre que mudar de página ou de voz
  useEffect(() => {
    if (itemAtivo && paginaAtualObj && !paginaAtualObj.pular) {
      prepararAudioEmBackground(itemAtivo.id, paginaAtualObj, vozTts);
    }
  }, [itemAtivo, paginaAtualObj, vozTts, prepararAudioEmBackground]);

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
        // Preenche a largura útil do container para que a página tenha bastante altura vertical de rolagem
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
          // Ignora texto vertical na margem
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

        // Remove blocos de assinatura digital no final da página
        const sigYs = raw.filter((r) => r.sig).map((r) => r.y);
        if (sigYs.length > 0) {
          const cutoff = Math.min(...sigYs);
          for (let i = raw.length - 1; i >= 0; i--) {
            if (raw[i].y >= cutoff - 2) raw.splice(i, 1);
          }
        }

        // Ordena de cima para baixo (e da esquerda para a direita na mesma linha)
        raw.sort((a, b) => {
          if (Math.abs(a.y - b.y) <= 6) return a.x - b.x;
          return a.y - b.y;
        });

        // Agrupa itens na mesma coordenada Y em LINHAS VISUAIS DO PDF
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

        // Casa cada linha do PDF com o texto falado (ou distribui proporcionalmente aos caracteres da linha)
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

        // Preenche frações monotônicas para TODAS as linhas da página (0..N-1)
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

          // Combina âncora exata do texto falado com a proporção de caracteres da linha
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

        // Garante monotonicidade estrita entre linhas consecutivas
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
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volumeBoost;
    }
  }, [volumeBoost]);

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

  // Converte o progresso bruto do áudio (0..1) na fração real do texto usando o mapa de blocos do Google TTS
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

  // Calcula a linha ativa do PDF e o alvo de scroll para o instante atual da leitura
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

    // Localiza exatamente qual linha do PDF está sendo lida neste instante
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

    // Posiciona a linha falada na zona de foco ocular (~36% do topo da área de leitura)
    const linhaLeituraOffset = container.clientHeight * 0.36;
    const maxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    // Soma o padding superior do container (24px)
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
            // Salto suave linha a linha (easing 0.16)
            container.scrollTop += diff * 0.16;
          }
        }
      }
      rafId = requestAnimationFrame(loopScroll);
    };

    rafId = requestAnimationFrame(loopScroll);

    // Mantém rolagem ativa mesmo se a aba ficar em segundo plano (ex.: OBS / projeção)
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    usandoFalaNativaRef.current = false;
    setIsPlaying(false);
  }

  async function tocarPagina(idxAlvo: number) {
    if (!itemAtivo || !paginas[idxAlvo]) return;
    const pagObj = paginas[idxAlvo];

    if (pagObj.pular) {
      if (idxAlvo + 1 < paginas.length) {
        setPaginaIdx(idxAlvo + 1);
        tocarPagina(idxAlvo + 1);
      }
      return;
    }

    setRolagemManualAtiva(false);

    // Opção 1: Voz Nativa do Navegador/Sistema (Web Speech API com eventos de palavra em tempo real)
    if (vozTts.startsWith('nativa:') && 'speechSynthesis' in window) {
      pararAudio();
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
        `🔊 Lendo Pág. ${pagObj.pagina_real} — Voz Nativa (${nomeVoz})`
      );
      setIsPlaying(true);
      window.speechSynthesis.speak(utter);
      return;
    }

    // Opção 2: Vozes IA Servidor (Google Feminina Brasil Gratuita / OpenAI Neural)
    usandoFalaNativaRef.current = false;
    conectarGainNodeSeNecessario();
    setGerandoAudio(true);
    setStatusFeedback(
      `⏳ Sintetizando voz para a Página ${pagObj.pagina_real}...`
    );

    try {
      const dadosAudio = await prepararAudioEmBackground(
        itemAtivo.id,
        pagObj,
        vozTts
      );

      if (!dadosAudio || !dadosAudio.audioUrl) {
        setStatusFeedback('⚠️ Falha ao gerar áudio TTS para esta página.');
        setGerandoAudio(false);
        return;
      }

      mapaTempoAtivoRef.current = dadosAudio.mapaTempo;

      const labelProvedor =
        dadosAudio.provedor === 'openai'
          ? `🔊 Voz Neural OpenAI (${dadosAudio.vozUsada}) — Pág. ${pagObj.pagina_real}`
          : `🔊 Voz Google Feminina (${dadosAudio.vozUsada}) — Pág. ${pagObj.pagina_real} (Rolagem Linha a Linha Ativa)`;
      setStatusFeedback(labelProvedor);

      if (audioRef.current) {
        audioRef.current.src = dadosAudio.audioUrl;
        audioRef.current.playbackRate = playbackRate;
        await audioRef.current.play();
        setIsPlaying(true);
      }

      // Pré-carrega em background o áudio da próxima página legível
      const proxIdx = paginas.findIndex((p, i) => i > idxAlvo && !p.pular);
      if (proxIdx !== -1) {
        prepararAudioEmBackground(itemAtivo.id, paginas[proxIdx], vozTts);
      }
    } catch (err) {
      console.error('Erro ao reproduzir áudio:', err);
      setStatusFeedback(
        '⚠️ Clique novamente em "Ler Página" para liberar o áudio no navegador.'
      );
    } finally {
      setGerandoAudio(false);
    }
  }

  function handlePlayPause() {
    if (isPlaying) {
      pararAudio();
      return;
    }
    if (
      !vozTts.startsWith('nativa:') &&
      audioRef.current &&
      audioRef.current.src &&
      audioRef.current.currentTime > 0 &&
      !audioRef.current.ended
    ) {
      conectarGainNodeSeNecessario();
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      tocarPagina(paginaIdx);
    }
  }

  function handleAudioEnded() {
    setIsPlaying(false);
    const proxIdx = paginas.findIndex((p, i) => i > paginaIdx && !p.pular);
    if (proxIdx !== -1) {
      setPaginaIdx(proxIdx);
      setLinhaAtivaIdx(0);
      setRolagemManualAtiva(false);
      setTimeout(() => tocarPagina(proxIdx), 350);
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
        cacheAudioPaginasRef.current = {};
        setPaginas(paginasEdicao);
        setItens((prev) =>
          prev.map((i) =>
            i.id === itemAtivo.id ? { ...i, jaRevisado: true } : i
          )
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

  const linhaAtivaObj = linhasPdfRef.current[linhaAtivaIdx] || null;

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
                    <span>{gerandoAudio ? 'Gerando Voz...' : 'Ler Página'}</span>
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

          {/* Seletores de Voz (Gratuitas Feminina Padrão + Sistema + OpenAI), Velocidade, Rolagem e Ganho */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="Selecionar Voz TTS"
              value={vozTts}
              onChange={(e) => {
                pararAudio();
                setVozTts(e.target.value);
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-emerald-500/40 text-slate-100 font-bold max-w-[270px]"
            >
              <optgroup label="🆓 Vozes Gratuitas Google IA (Sem Chave)">
                <option value="google-feminina">
                  🌐 Google Feminina Brasil (Fluida — Padrão)
                </option>
                <option value="google-solene">
                  🌐 Google Feminina Brasil (Cadência Solene)
                </option>
                <option value="google-clara">
                  🌐 Google Feminina Brasil (Clara GTX)
                </option>
                <option value="google-pt">
                  🌐 Google Feminina Clássica (Português)
                </option>
              </optgroup>

              {vozesNativasPt.length > 0 && (
                <optgroup label="🆓 Vozes Gratuitas do Sistema / Navegador (pt-BR)">
                  {vozesNativasPt.map((v) => (
                    <option key={v.name} value={`nativa:${v.name}`}>
                      🗣️ {v.name} ({v.lang})
                    </option>
                  ))}
                </optgroup>
              )}

              <optgroup label="🔑 Vozes OpenAI Neural (Requer Chave API)">
                <option value="nova">✨ Nova (Feminina Dinâmica)</option>
                <option value="shimmer">✨ Shimmer (Feminina Clara)</option>
                <option value="coral">✨ Coral (Feminina Expressiva)</option>
                <option value="sage">✨ Sage (Feminina Institucional)</option>
                <option value="onyx">✨ Onyx (Masculina Grave)</option>
                <option value="echo">✨ Echo (Masculina Suave)</option>
                <option value="alloy">✨ Alloy (Neutra)</option>
              </optgroup>
            </select>

            <select
              aria-label="Velocidade da Fala"
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 font-bold tabular-nums"
            >
              <option value={0.95}>Fala: 0.95x</option>
              <option value={1.0}>Fala: 1.00x</option>
              <option value={1.1}>Fala: 1.10x (Padrão)</option>
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
              title="Escolha entre pular linha por linha conforme a leitura ou rolagem contínua"
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
              <option value={1.12}>Sincronia: -12% (Mais Lenta)</option>
              <option value={1.0}>Sincronia: 100% (Exata)</option>
              <option value={0.9}>Sincronia: +10% (Adiantada)</option>
              <option value={0.8}>Sincronia: +20% (Rápida)</option>
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
        {/* IMPORTANTE: display block (sem flex-col) para nunca comprimir a altura do canvas e garantir scroll completo */}
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

              {/* Marcador Visual da Linha Ativa em Leitura (Pula linha a linha sincronizado com a voz) */}
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

      {/* Modal <dialog> de Preparação do Roteiro de Leitura (#modal-prep) */}
      <dialog
        ref={modalPrepRef}
        aria-labelledby="modal-prep-title"
        onClick={(e) => {
          if (e.target === modalPrepRef.current) modalPrepRef.current?.close();
        }}
        className="rounded-3xl p-0 backdrop:bg-slate-950/75 shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 w-full max-w-4xl m-auto"
      >
        <form
          onSubmit={handleSalvarEGerarAudiosModal}
          className="p-6 sm:p-8 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3
                id="modal-prep-title"
                className="text-xl font-extrabold text-white"
              >
                ✨ Preparação do Roteiro de Leitura — {itemAtivo?.titulo}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Revise o texto extraído de cada página, marque páginas para pular
                (ex.: assinaturas) e gere a voz sincronizada.
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
                  {revisandoIaModal
                    ? 'Revisando com IA...'
                    : '✨ Revisar Formatações'}
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
                  rows={5}
                  disabled={Boolean(p.pular)}
                  value={p.texto}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPaginasEdicao((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, texto: val } : x
                      )
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
