'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';

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
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib?: any;
  }
}

export default function TelaoLeituraObsPage() {
  const params = useParams();
  const sessaoId = String(params.id || '');

  const [pdfjsPronto, setPdfjsPronto] = useState(false);
  const [estado, setEstado] = useState<EstadoSyncLeitura | null>(null);
  const [mostrarGc, setMostrarGc] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const loadedPdfUrlRef = useRef<string | null>(null);
  const renderedPageRef = useRef<number>(0);

  // Motor de Rolagem Cinematográfica (Amortecedor Contínuo no requestAnimationFrame)
  const targetScrollRef = useRef<number>(0);
  const currentScrollFloatRef = useRef<number>(0);

  useEffect(() => {
    let rafId: number;
    const animar = () => {
      const container = viewportRef.current;
      if (container && targetScrollRef.current >= 0) {
        const diff = targetScrollRef.current - currentScrollFloatRef.current;
        if (Math.abs(diff) > 350) {
          currentScrollFloatRef.current = targetScrollRef.current;
        } else if (Math.abs(diff) > 0.3) {
          currentScrollFloatRef.current += diff * 0.035;
        }
        container.scrollTop = Math.round(currentScrollFloatRef.current);
      }
      rafId = requestAnimationFrame(animar);
    };
    rafId = requestAnimationFrame(animar);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Polling de 500ms do estado de sincronização
  useEffect(() => {
    if (!sessaoId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessoes/${sessaoId}/leitura-sync`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.estado) {
          setEstado(data.estado);
          setMostrarGc(Boolean(data.estado.titulo));
        }
      } catch {
        // Ignora oscilação momentânea
      }
    }, 500);
    return () => clearInterval(interval);
  }, [sessaoId]);

  // Renderiza o PDF e página quando estado mudar
  useEffect(() => {
    async function renderizarPaginaTelao() {
      if (!pdfjsPronto || !window.pdfjsLib || !estado?.pdfUrl || !canvasRef.current) {
        return;
      }

      try {
        const urlResolvida = estado.pdfUrl.replace(/^\/uploads\//, '/api/arquivos/');
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
          const page = await pdfDoc.getPage(numPag);
          const canvas = canvasRef.current;
          const containerWidth = viewportRef.current?.clientWidth || 1280;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth * 0.92) / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
          currentScrollFloatRef.current = 0;
        }

        // Calcula alvo de rolagem proporcional à altura máxima do container do Telão
        const container = viewportRef.current;
        if (container) {
          const maxScrollTelao = Math.max(
            0,
            container.scrollHeight - container.clientHeight
          );
          targetScrollRef.current = (estado.scrollRatio || 0) * maxScrollTelao;
        }
      } catch (err) {
        console.error('Erro ao renderizar PDF no Telão:', err);
      }
    }

    renderizarPaginaTelao();
  }, [pdfjsPronto, estado]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#1E2227] flex flex-col relative select-none">
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

      {/* GC Flutuante Institucional (Câmara Municipal de Itapoá) */}
      {mostrarGc && estado && (
        <div className="fixed top-8 left-8 z-50 max-w-3xl bg-white/95 backdrop-blur-md border-l-10 border-[#0A2540] rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4 animate-in fade-in slide-in-from-left-8 duration-500">
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
