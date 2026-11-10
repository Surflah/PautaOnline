'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha na autenticação.');
        setCarregando(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setErro('Erro de comunicação com o servidor.');
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-[#0A2540] via-[#0F172A] to-[#1E293B] p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
        <div className="bg-[#0A2540] px-8 pt-9 pb-7 text-center border-b border-slate-800">
          <div className="w-24 h-24 mx-auto mb-4 rounded-2xl bg-white p-2.5 shadow-lg flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Brasão da Câmara Municipal de Itapoá"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            PautaOnline
          </h1>
          <p className="text-sm text-blue-200 font-medium mt-1">
            Câmara Municipal de Itapoá — SC
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {erro && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"
            >
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
              <span>{erro}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="usuario"
              className="block text-sm font-bold text-slate-700 mb-2"
            >
              Usuário Institucional
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                id="usuario"
                name="usuario"
                type="text"
                required
                autoComplete="username"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Ex: camara"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all text-base"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="senha"
              className="block text-sm font-bold text-slate-700 mb-2"
            >
              Senha de Acesso
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                id="senha"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••••"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all text-base"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full min-h-[52px] flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-base rounded-xl shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
          >
            <span>{carregando ? 'Autenticando...' : 'Entrar no Sistema'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Sistema Oficial de Plenário & Controle Interno</span>
          </div>
        </form>
      </div>
    </div>
  );
}
