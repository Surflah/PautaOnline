---
name: frontend-excellence
description: >-
  Use this skill whenever designing, building, or refining any frontend interface,
  component, tablet view, PDF teleprompter, or OBS/projector broadcast screen in PautaOnline.
  Ensures modern institutional aesthetics, high plenário touch ergonomics, responsive layouts,
  and broadcast-grade animations.
---

# Frontend Excellence — PautaOnline UI/UX Guide

## 1. Identidade Visual Institucional (Câmara Municipal de Itapoá)
- **Paleta Institucional Moderna**:
  - Primária (Azul Legislativo Profundo): `#0A2540` / `#003366`
  - Acento Institucional (Azul Real): `#0066CC` / `#2563EB`
  - Sucesso / Aprovação / Presente: `#10B981` / `#16A34A`
  - Alerta / Urgência / Justificativa: `#F59E0B` / `#EAB308`
  - Perigo / Rejeição / Ausência: `#EF4444` / `#DC2626`
  - IA / Leitura Automatizada: `#7C3AED` / `#8E44AD`
  - Superfícies Claras: `#F8FAFC` (fundo), `#FFFFFF` (cards com bordas sutis `#E2E8F0`)
  - Superfícies Escuras (Teleprompter / Telão / Painel de Leitura): `#0F172A`, `#1E293B`
- **Tipografia**:
  - Interfaces administrativas e tablets: `Inter` ou `Plus Jakarta Sans` (alta legibilidade em tamanhos grandes).
  - Telões de Plenário e GC (OBS Studio): `Montserrat` ou `Poppins` (pesos 600, 700, 900 para leitura à distância e em vídeo).
  - Valores numéricos, placares e contadores: usar `font-variant-numeric: tabular-nums`.

## 2. Ergonomia para Tablets em Plenário
As telas de **Deliberação**, **Palavra Livre**, **Mestre de Cerimônias**, **Mesa Presidente** e **Mesa Secretária** são operadas ao vivo sob pressão:
1. **Alvos de Toque Amplos**: Botões e controles de voto/presença devem ter no mínimo `48px x 48px` de área clicável.
2. **Feedback Visual Imediato**:
   - Linhas de vereadores presentes ou que já votaram devem mudar de cor imediatamente.
   - Botões de ação crítica devem desabilitar no primeiro toque (evitando duplo envio) e exibir estado de carregamento claro.
3. **Destaque de Turno de Fala**:
   - Nos tablets de Cerimonial/Roteiro, diferenciar claramente o estado **Ativo ("🎤 SUA VEZ DE FALAR")** com borda lateral espessa e alto contraste do estado **Passivo ("👁️ Acompanhando...")**.
4. **Modo Claro / Escuro e Tela Cheia**:
   - Sempre oferecer alternância rápida de tema (Claro/Escuro), ajuste de tamanho de fonte no teleprompter e botão de Tela Cheia (`requestFullscreen`).

## 3. Telões Públicos e Overlays OBS (GC)
- **Telão de Plenário**: Layout 16:9 sem barra de rolagem (`overflow: hidden`), transições suaves (`cubic-bezier(0.22, 1, 0.36, 1)`), avatares com fallback de iniciais e barras de progresso fluidas.
- **GC para OBS Studio**: Fundo 100% transparente (`background: transparent`), lower-third ancorado na base com entrada/saída animada suave e sombras projetadas para leitura perfeita sobre vídeo ao vivo.
