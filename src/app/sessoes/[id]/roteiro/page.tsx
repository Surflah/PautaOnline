'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import { Printer, ArrowLeft } from 'lucide-react';

interface PautaItemRoteiro {
  id: number;
  numero: number;
  titulo: string;
  ementa: string;
  tipoItem: string;
  autor: string;
  votacaoEtapa: string;
  votavel: boolean;
}

interface SessaoRoteiro {
  id: number;
  nome: string;
  dataSessao: string;
  itens: PautaItemRoteiro[];
}

export default function RoteiroImprimirPage() {
  const params = useParams();
  const sessaoId = String(params.id || '');
  const [sessao, setSessao] = useState<SessaoRoteiro | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function load() {
      setCarregando(true);
      try {
        const res = await fetch(`/api/sessoes/${sessaoId}/pauta`);
        const data = await res.json();
        if (data.sessao) setSessao(data.sessao);
      } finally {
        setCarregando(false);
      }
    }
    if (sessaoId) load();
  }, [sessaoId]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <NavbarInstitucional />

      <div className="no-print max-w-4xl w-full mx-auto px-4 pt-6 flex items-center justify-between gap-4">
        <Link
          href={`/sessoes/${sessaoId}/pauta`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-xs hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para a Pauta</span>
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-md cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir Roteiro Oficial (A4)</span>
        </button>
      </div>

      <main className="print-container max-w-4xl w-full mx-auto my-6 bg-white rounded-2xl shadow-md border border-slate-200 p-8 sm:p-12">
        {carregando ? (
          <p className="text-center text-slate-500 py-12 font-medium">
            Gerando roteiro para impressão...
          </p>
        ) : !sessao ? (
          <p className="text-center text-red-600 py-12 font-bold">
            Sessão não encontrada.
          </p>
        ) : (
          <div className="space-y-8">
            {/* Cabeçalho Institucional A4 */}
            <header className="flex items-center gap-5 border-b-2 border-slate-900 pb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Brasão da Câmara Municipal de Itapoá"
                className="w-20 h-20 object-contain shrink-0"
              />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                  Estado de Santa Catarina — Poder Legislativo
                </p>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 uppercase">
                  Câmara Municipal de Itapoá
                </h1>
                <h2 className="text-base sm:text-lg font-bold text-blue-900 mt-1">
                  Roteiro da Presidência — {sessao.nome}
                </h2>
              </div>
            </header>

            {/* Lista de Itens do Roteiro */}
            <div className="space-y-6">
              {sessao.itens.map((item) => (
                <article
                  key={item.id}
                  className="print-item border border-slate-300 rounded-xl p-5 bg-white space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                      {item.numero}. {item.titulo}
                    </h3>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {item.autor && (
                        <span className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                          Autoria: {item.autor}
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded border ${
                          item.votavel
                            ? 'bg-blue-50 text-blue-900 border-blue-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {item.votavel ? item.votacaoEtapa : 'Rito / Leitura'}
                      </span>
                    </div>
                  </div>

                  {item.ementa && (
                    <div className="text-sm sm:text-base text-slate-900 whitespace-pre-wrap leading-relaxed font-medium">
                      {item.ementa.replace(
                        /\[CHAMADA\]/g,
                        '\n[ REALIZAR CHAMADA NOMINAL DOS VEREADORES NO TABLET ]\n'
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
