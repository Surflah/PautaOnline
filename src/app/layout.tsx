import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PautaOnline — Câmara Municipal de Itapoá',
  description:
    'Sistema Institucional de Gestão de Pautas, Deliberação em Plenário, Leitura Automatizada com IA e Cerimonial — Câmara Municipal de Itapoá-SC',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A2540',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${jakarta.className} min-h-screen flex flex-col bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
