import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { NavbarInstitucional } from '@/components/NavbarInstitucional';
import {
  FileSpreadsheet,
  CheckCircle2,
  Mic2,
  Users,
  Award,
  Sparkles,
  Printer,
  ArrowRight,
  Calendar,
  BookOpenCheck,
  ShieldCheck,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [totalSessoes, totalVereadores, vereadorPresidente, openaiCfg, ultimasSessoes] =
    await Promise.all([
      prisma.sessao.count(),
      prisma.vereador.count({ where: { isLicenciado: false } }),
      prisma.vereador.findFirst({ where: { isPresidente: true } }),
      prisma.configuracao.findUnique({ where: { chave: 'openai_key' } }),
      prisma.sessao.findMany({
        orderBy: { id: 'desc' },
        take: 5,
        include: {
          _count: {
            select: { itens: true, votos: true },
          },
        },
      }),
    ]);

  const modulosPrincipais = [
    {
      titulo: 'Gerenciar Sessões & Pauta',
      descricao:
        'Cadastre sessões, monte a pauta completa integrada ao SAPL, importe matérias, anexe PDFs e organize a ordem regimental.',
      href: '/sessoes',
      icone: FileSpreadsheet,
      cor: 'from-blue-600 to-blue-700',
      badge: `${totalSessoes} sessões`,
    },
    {
      titulo: 'Montar Pauta do SAPL (Rito + Ordem do Dia)',
      descricao:
        'Gere automaticamente os 9 itens do Rito Padrão com artigo do Regimento Interno, triagem de urgência (Art. 51 LOM) e Indicações agrupadas.',
      href: '/sessoes/montar-sapl',
      icone: Sparkles,
      cor: 'from-indigo-600 to-violet-700',
      badge: 'Integração SAPL',
    },
    {
      titulo: 'Iniciar Deliberação em Plenário',
      descricao:
        'Painel ergonômico para tablet do Presidente/Secretaria: chamada nominal com quórum, votação regimental e controle de itens ao vivo.',
      href: '/sessoes?modo=deliberar',
      icone: CheckCircle2,
      cor: 'from-emerald-600 to-teal-700',
      badge: 'Plenário Ao Vivo',
    },
    {
      titulo: 'Espaço Regimental (Palavra Livre)',
      descricao:
        'Sorteio eletrônico de ordem de fala dos vereadores inscritos, controle de fila ao vivo e status de pronunciamento em plenário.',
      href: '/palavra-livre',
      icone: Mic2,
      cor: 'from-amber-500 to-orange-600',
      badge: 'Sorteio & Fila',
    },
    {
      titulo: 'Cadastro de Vereadores & Chave IA',
      descricao:
        'Gerencie os parlamentares ativos, defina o Presidente da Mesa, controle licenças e configure a chave OpenAI (GPT + TTS).',
      href: '/vereadores',
      icone: Users,
      cor: 'from-slate-700 to-slate-900',
      badge: `${totalVereadores} ativos`,
    },
    {
      titulo: 'Cerimonial & Câmara Mirim',
      descricao:
        'Gestão de sessões solenes, posse e eleição da Mesa Diretora Mirim com roteiro sincronizado para Mestre de Cerimônias, Telão e GC OBS.',
      href: '/cerimonial',
      icone: Award,
      cor: 'from-purple-600 to-fuchsia-700',
      badge: 'Solenes & Mirim',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavbarInstitucional />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner Institucional */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0A2540] via-[#0F2942] to-[#1E3A8A] text-white p-6 sm:p-8 shadow-xl">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-bold uppercase tracking-wider text-blue-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Sistema Legislativo Oficial — Câmara Municipal de Itapoá</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Gestão de Pautas, Deliberação e Leitura Automatizada
              </h1>
              <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                Plataforma integrada ao SAPL para preparação do rito legislativo, controle
                de quórum e votação em plenário, leitura por Inteligência Artificial e
                transmissão oficial.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4 text-center">
                <p className="text-xs font-semibold text-blue-200 uppercase">Sessões</p>
                <p className="text-2xl font-extrabold tabular-nums mt-1">{totalSessoes}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4 text-center">
                <p className="text-xs font-semibold text-blue-200 uppercase">Presidente</p>
                <p className="text-lg font-extrabold truncate mt-1">
                  {vereadorPresidente ? vereadorPresidente.nome : 'Não def.'}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4 text-center">
                <p className="text-xs font-semibold text-blue-200 uppercase">Voz IA / OpenAI</p>
                <p className="text-sm font-bold mt-1.5 flex items-center justify-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      openaiCfg?.valor ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span>{openaiCfg?.valor ? 'Ativa' : 'Voz Google'}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Grid de Módulos Principais (Ergonomia de Tablet) */}
        <section aria-labelledby="modulos-heading">
          <div className="flex items-center justify-between mb-4">
            <h2
              id="modulos-heading"
              className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight"
            >
              Módulos de Operação Legislativa
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {modulosPrincipais.map((mod) => {
              const Icon = mod.icone;
              return (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className="group bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all flex flex-col justify-between gap-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className={`w-13 h-13 rounded-2xl bg-gradient-to-br ${mod.cor} text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {mod.badge}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {mod.titulo}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                        {mod.descricao}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-blue-600">
                    <span>Acessar Módulo</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Últimas Sessões Cadastradas */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-extrabold text-slate-900">
                Sessões Recentes
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/sessoes/montar-sapl"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Montar Pauta do SAPL</span>
              </Link>
              <Link
                href="/sessoes"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-all"
              >
                <span>Ver Todas</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {ultimasSessoes.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <BookOpenCheck className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-base font-bold text-slate-700">
                Nenhuma sessão cadastrada ainda
              </p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Crie uma sessão manualmente ou importe diretamente uma sessão plenária do
                SAPL da Câmara Municipal de Itapoá.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <Link
                  href="/sessoes/montar-sapl"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Montar Primeira Sessão do SAPL</span>
                </Link>
              </div>
            </div>
          ) : (
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Tabela de Sessões Recentes"
              tabIndex={0}
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                    <th scope="col" className="py-3.5 px-6">
                      ID
                    </th>
                    <th scope="col" className="py-3.5 px-6">
                      Sessão Legislativa
                    </th>
                    <th scope="col" className="py-3.5 px-6 text-center">
                      Itens na Pauta
                    </th>
                    <th scope="col" className="py-3.5 px-6 text-right">
                      Ações Rápidas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {ultimasSessoes.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-500 tabular-nums">
                        #{s.id}
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {s.nome}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 tabular-nums">
                          {s._count.itens} itens
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <Link
                            href={`/sessoes/${s.id}/deliberacao`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Deliberar</span>
                          </Link>
                          <Link
                            href={`/sessoes/${s.id}/pauta`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Gerenciar Pauta</span>
                          </Link>
                          <Link
                            href={`/sessoes/${s.id}/roteiro`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Roteiro A4</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
