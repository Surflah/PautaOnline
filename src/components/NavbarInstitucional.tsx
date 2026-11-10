'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  Mic2,
  Award,
  LogOut,
  Sparkles,
} from 'lucide-react';

export function NavbarInstitucional() {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function handleLogout() {
    setSaindo(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } finally {
      setSaindo(false);
    }
  }

  const navItems = [
    { href: '/', label: 'Painel Inicial', icon: LayoutDashboard },
    { href: '/sessoes', label: 'Sessões & Pauta', icon: FileSpreadsheet },
    { href: '/sessoes/montar-sapl', label: 'Montar do SAPL', icon: Sparkles },
    { href: '/vereadores', label: 'Vereadores & IA', icon: Users },
    { href: '/sessoes?modo=deliberar', label: 'Deliberação', icon: CheckCircle2 },
    { href: '/palavra-livre', label: 'Espaço Regimental', icon: Mic2 },
    { href: '/cerimonial', label: 'Cerimonial', icon: Award },
  ];

  return (
    <header className="no-print sticky top-0 z-40 bg-[#0A2540] text-white shadow-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          <Link href="/" className="flex items-center gap-3.5 group shrink-0">
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md flex items-center justify-center transition-transform group-hover:scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Brasão da Câmara Municipal de Itapoá"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  PautaOnline
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Câmara Municipal de Itapoá — Poder Legislativo
              </p>
            </div>
          </Link>

          <nav className="hidden xl:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href.split('?')[0]) &&
                    item.href !== '/sessoes?modo=deliberar';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              disabled={saindo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/25 text-sm font-semibold transition-all cursor-pointer min-h-[44px]"
              title="Encerrar sessão no sistema"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{saindo ? 'Saindo...' : 'Sair'}</span>
            </button>
          </div>
        </div>

        {/* Navegação compacta p/ tablets e telas médias */}
        <div className="flex xl:hidden items-center gap-1.5 overflow-x-auto pb-3 pt-1 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-slate-200 hover:bg-white/15'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
