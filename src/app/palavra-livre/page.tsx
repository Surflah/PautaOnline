import React from 'react';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import { Mic2, ArrowLeft, Clock } from 'lucide-react';

export default function PalavraLivrePlaceholderPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Mic2 className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>Módulo Programado para a Fase 2</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Espaço Regimental (Palavra Livre)
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            O sorteio eletrônico de ordem de fala dos vereadores inscritos e o controle
            ao vivo de pronunciamentos em plenário serão ativados na <strong>Fase 2</strong>,
            junto com o painel de Deliberação em Plenário.
          </p>
          <div className="pt-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Painel Principal</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
