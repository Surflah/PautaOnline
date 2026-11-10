import React from 'react';
import Link from 'next/link';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import { Award, ArrowLeft, Clock } from 'lucide-react';

export default function CerimonialPlaceholderPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
            <Award className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>Módulo Programado para a Fase 4</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Cerimonial & Câmara Mirim
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            A modelagem de dados do Cerimonial já está pronta no banco de dados. Os
            painéis sincronizados do Mestre de Cerimônias, Mesa Presidente, Mesa
            Secretária, Telão de Eleição e GC OBS serão ativados na <strong>Fase 4</strong>.
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
