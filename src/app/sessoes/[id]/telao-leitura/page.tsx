'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import { Volume2 } from 'lucide-react';

interface EstadoSyncLeitura {
  pautaId: number;
  titulo: string;
  autor: string;
  etapa: string;
  pdfUrl: string | null;
  pagina: number;
  scrollRatio: number;
  scrollY: number;
  maxScroll: number;
  audioUrl: string | null;
  isPlaying: boolean;
  tocarNoTelao?: boolean;
  currentTime: number;
  playbackRate: number;
  volumeBoost?: number;
  updatedAt: number;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib?: any;
  }
}

function normalizarUrlMidia(url: string | null | undefined): string | null {
  if (!url) return null;
  let limpo = url.trim();
  if (!limpo) return null;
  if (/^https?:\/\//i.test(limpo)) {
    try {
      const u = new URL(limpo);
      limpo = u.pathname + u.search;
    } catch {
      // mantém original
    }
  }
  return limpo.replace(/^\/uploads\//, '/api/arquivos/');
}

export default function TelaoLeituraObsPage() {
  const params = useParams();
  const sessaoId = String(params.id || '');

  const [pdfjsPronto, setPdfjsPronto] = useState(false);
  const [estado, setEstado] = useState<EstadoSyncLeitura | null>(null);
  const [mostrarGc, setMostrarGc] = useState(false);
  const [precisaDesbloquearAudio, setPrecisaDesbloquearAudio] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioTelaoRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceConectadoRef = useRef(false);
  const loadedAudioUrlRef = useRef<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);
  const loadedPdfUrlRef = useRef<string | null>(null);
  const renderedPageRef = useRef<number>(0);

  // Motor de Rolagem Cinematográfica (Amortecedor Contínuo no requestAnimationFrame)
  const targetScrollRef = useRef<number>(0);
  const currentScrollFloatRef = useRef<number>(0);

  // Garante detecção do PDF.js mesmo quando já carregado em cache
  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined' && window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        setPdfjsPronto(true);
        return true;
      }
      return false;
    };
    if (!check()) {
      const t = setInterval(() => {
        if (check()) clearInterval(t);
      }, 250);
      return () => clearInterval(t);
    }
  }, []);

  useEffect(() => {
    let rafId: number;
    const animar = () => {
      const container = viewportRef.current;
      if (container && targetScrollRef.current >= 0) {
        const diff = targetScrollRef.current - currentScrollFloatRef.current;
        if (Math.abs(diff) > 420) {
          currentScrollFloatRef.current = targetScrollRef.current;
        } else if (Math.abs(diff) > 0.3) {
          currentScrollFloatRef.current += diff * 0.08;
        }
        container.scrollTop = Math.round(currentScrollFloatRef.current);
      }
      rafId = requestAnimationFrame(animar);
    };
    rafId = requestAnimationFrame(animar);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function aplicarBoostSeguro(boost: number) {
    const audioEl = audioTelaoRef.current;
    if (!audioEl) return;

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = boost;
      return;
    }

    if (boost <= 1.05) {
      audioEl.volume = Math.min(1, Math.max(0, boost));
      return;
    }

    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      const conectar = () => {
        if (ctx.state === 'running' && !sourceConectadoRef.current && audioTelaoRef.current) {
          const source = ctx.createMediaElementSource(audioTelaoRef.current);
          const gain = ctx.createGain();
          gain.gain.value = boost;
          source.connect(gain);
          gain.connect(ctx.destination);
          gainNodeRef.current = gain;
          sourceConectadoRef.current = true;
        }
      };

      if (ctx.state === 'running') {
        conectar();
      } else {
        ctx
          .resume()
          .then(conectar)
          .catch(() => {
            // Mantém volume nativo 100% do elemento <audio> sem silenciar
            audioEl.volume = 1.0;
          });
      }
    } catch {
      audioEl.volume = 1.0;
    }
  }

  function sincronizarAudioTelao(est: EstadoSyncLeitura, serverTime: number) {
    const audio = audioTelaoRef.current;
    if (!audio) return;

    const urlAudio = normalizarUrlMidia(est.audioUrl);
    const idadeMs = Math.max(0, serverTime - (est.updatedAt || 0));
    const deveTocar = Boolean(
      est.isPlaying && est.tocarNoTelao !== false && urlAudio && idadeMs < 10000
    );

    const taxa = est.playbackRate || 1.0;
    const boost = est.volumeBoost ?? 1.7;

    if (urlAudio && loadedAudioUrlRef.current !== urlAudio) {
      loadedAudioUrlRef.current = urlAudio;
      audio.src = urlAudio;
      audio.playbackRate = taxa;
      if (est.currentTime > 0) {
        try {
          audio.currentTime = est.currentTime;
        } catch {
          // Aguarda metadata carregar
        }
      }
    }

    if (Math.abs(audio.playbackRate - taxa) > 0.01) {
      audio.playbackRate = taxa;
    }

    if (deveTocar && urlAudio) {
      aplicarBoostSeguro(boost);

      if (audio.paused) {
        if (
          Number.isFinite(est.currentTime) &&
          Math.abs(audio.currentTime - est.currentTime) > 0.4
        ) {
          try {
            audio.currentTime = est.currentTime;
          } catch {
            // Ignora antes de loadedmetadata
          }
        }
        audio
          .play()
          .then(() => {
            setPrecisaDesbloquearAudio(false);
          })
          .catch((err) => {
            if (err?.name === 'NotAllowedError') {
              setPrecisaDesbloquearAudio(true);
            }
          });
      } else if (
        Number.isFinite(est.currentTime) &&
        Math.abs(audio.currentTime - est.currentTime) > 1.6
      ) {
        // Corrige apenas desvios grandes (> 1.6s) para não engasgar a fala no OBS
        try {
          audio.currentTime = est.currentTime;
        } catch {
          // Ignora
        }
      }
    } else if (!audio.paused) {
      audio.pause();
    }
  }

  function desbloquearAudioManualmente() {
    const audio = audioTelaoRef.current;
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (audio && audio.src) {
      audio
        .play()
        .then(() => setPrecisaDesbloquearAudio(false))
        .catch(() => {});
    } else {
      setPrecisaDesbloquearAudio(false);
    }
  }

  // Polling de 400ms do estado de sincronização (Vídeo + Áudio para OBS)
  useEffect(() => {
    if (!sessaoId) return;
    let ativo = true;

    const sincronizar = async () => {
      try {
        const res = await fetch(`/api/sessoes/${sessaoId}/leitura-sync`, {
          cache: 'no-store',
        });
        if (!res.ok || !ativo) return;
        const data = await res.json();
        if (data.estado) {
          setEstado(data.estado);
          setMostrarGc(Boolean(data.estado.titulo));
          sincronizarAudioTelao(
            data.estado,
            Number(data.serverTime || Date.now())
          );
        }
      } catch {
        // Ignora oscilação momentânea
      }
    };

    sincronizar();
    const interval = setInterval(sincronizar, 400);
    return () => {
      ativo = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId]);

  // Renderiza o PDF e página quando estado mudar
  useEffect(() => {
    async function renderizarPaginaTelao() {
      if (!pdfjsPronto || !window.pdfjsLib || !estado?.pdfUrl || !canvasRef.current) {
        return;
      }

      try {
        const urlResolvida = normalizarUrlMidia(estado.pdfUrl);
        if (!urlResolvida) return;

        if (loadedPdfUrlRef.current !== urlResolvida) {
          loadedPdfUrlRef.current = urlResolvida;
          renderedPageRef.current = 0;
          const loadingTask = window.pdfjsLib.getDocument(urlResolvida);
          pdfDocRef.current = await loadingTask.promise;
        }

        const pdfDoc = pdfDocRef.current;
        if (!pdfDoc) return;

        const numPag = Math.min(Math.max(1, estado.pagina || 1), pdfDoc.numPages);
        if (renderedPageRef.current !== numPag) {
          renderedPageRef.current = numPag;
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
            } catch {
              // Ignora
            }
          }

          const page = await pdfDoc.getPage(numPag);
          const canvas = canvasRef.current;
          if (!canvas) return;
          const containerWidth = viewportRef.current?.clientWidth || 1280;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth * 0.92) / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const task = page.render({ canvasContext: ctx, viewport });
            renderTaskRef.current = task;
            await task.promise;
            renderTaskRef.current = null;
          }
          currentScrollFloatRef.current = 0;
        }

        const container = viewportRef.current;
        if (container) {
          const maxScrollTelao = Math.max(
            0,
            container.scrollHeight - container.clientHeight
          );
          targetScrollRef.current = (estado.scrollRatio || 0) * maxScrollTelao;
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
        console.error('Erro ao renderizar PDF no Telão:', err);
      }
    }

    renderizarPaginaTelao();
  }, [pdfjsPronto, estado]);

  return (
    <div
      onClick={() => {
        if (precisaDesbloquearAudio) desbloquearAudioManualmente();
      }}
      className="h-screen w-screen overflow-hidden bg-[#1E2227] flex flex-col relative select-none"
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

      {/* Reprodutor de Áudio Sincronizado para Captura Direta no OBS Studio ("Controlar áudio via OBS") */}
      <audio ref={audioTelaoRef} preload="auto" className="hidden" />

      {/* Botão de desbloqueio caso aberto em navegador comum fora do OBS Studio */}
      {precisaDesbloquearAudio && (
        <button
          type="button"
          onClick={desbloquearAudioManualmente}
          className="fixed bottom-8 right-8 z-50 px-6 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base shadow-2xl flex items-center gap-3 cursor-pointer animate-bounce"
        >
          <Volume2 className="w-6 h-6" />
          <span>Toque aqui 1x para liberar o som neste navegador</span>
        </button>
      )}

      {/* GC Flutuante Institucional (Câmara Municipal de Itapoá) */}
      {mostrarGc && estado && (
        <div className="fixed top-8 left-8 z-40 max-w-3xl bg-white/95 backdrop-blur-md border-l-10 border-[#0A2540] rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4 animate-in fade-in slide-in-from-left-8 duration-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Brasão Câmara de Itapoá"
            className="w-12 h-12 object-contain shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-blue-700">
                {estado.isPlaying ? '🔊 Em Leitura Oficial' : '📄 Documento em Plenário'}
              </span>
              {estado.etapa && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {estado.etapa} — Pág. {estado.pagina}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 truncate mt-0.5">
              {estado.titulo}
            </h1>
            {estado.autor && (
              <p className="text-xs font-bold text-slate-500 truncate">
                Autoria: {estado.autor}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Viewport do Documento PDF */}
      <div
        ref={viewportRef}
        className="flex-1 w-full h-full overflow-y-hidden relative block pt-6 pb-[55vh]"
      >
        {!estado?.pdfUrl ? (
          <div className="my-20 mx-auto text-center space-y-4 bg-slate-900/80 border border-white/10 rounded-3xl p-10 text-white shadow-2xl max-w-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Brasão Câmara Municipal de Itapoá"
              className="w-20 h-20 mx-auto object-contain"
            />
            <h2 className="text-2xl font-extrabold tracking-tight">
              Telão de Leitura — Plenário
            </h2>
            <p className="text-sm text-slate-300 font-medium">
              {estado?.titulo
                ? `Em exibição: ${estado.titulo}`
                : 'Aguardando o operador selecionar um documento no Painel Pro de Leitura...'}
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="block mx-auto shadow-2xl rounded-lg bg-white will-change-transform"
          />
        )}
      </div>
    </div>
  );
}
