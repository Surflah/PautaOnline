---
name: sapl-and-ai-integration
description: >-
  Use this skill when implementing SAPL integration (fetching sessions, Ordem do Dia,
  expediente triage, Regimento Interno articles, merging PDFs/Indicações) or AI/PDF reading
  features (OpenAI text cleanup, TTS audio generation, and PDF.js anchored auto-scrolling).
---

# SAPL, PDF & AI Reading Integration Guide

## 1. Integração com o SAPL (`sapl.itapoa.sc.leg.br`)
- **Sessões e Ordem do Dia**:
  - Consulta as últimas sessões plenárias/comissões e lista as matérias da Ordem do Dia com `numero_ordem`, `materia_id`, `titulo`, `tipo`, `numero`, `autor`, `ementa` e links de PDF (texto original e documentos acessórios).
- **Modos de Anexo PDF**:
  - `texto`: Baixa apenas o PDF do texto original da proposição (padrão para Sessões Ordinárias).
  - `mesclado`: Baixa e mescla o texto original + documentos acessórios/pareceres em um único PDF (padrão para Reuniões de Comissões).
- **Agrupamento Automático de Indicações**:
  - Todas as matérias do tipo `Indicação` selecionadas na importação do SAPL são agrupadas em **um único item não-votável** intitulado `Leitura das Indicações`, com ementa `"Solicito a Leitura das Indicações X a Y de AAAA..."` e todos os seus PDFs mesclados em ordem numérica.
- **Triagem de Expediente e Geração do Rito**:
  - Extrai o texto dos PDFs das matérias do expediente para detectar pedidos de **Regime de Urgência (Art. 51 da Lei Orgânica Municipal)** e **Leis Orçamentárias**.
  - Busca o artigo solicitado do Regimento Interno (Norma 1749 no SAPL) para compor o Item 2 da pauta.

## 2. Preparação de Leitura com IA e TTS
- **Elegibilidade para Revisão em Lote**:
  - Entram na fila apenas itens com `votavel == true`, com PDF anexado, em `Primeira Votação` ou `Única Votação` (itens em `Segunda Votação` ficam de fora pois já foram lidos na primeira).
- **Regras do Prompt de Limpeza de Texto (LLM)**:
  - Ignorar/remover textos tachados (strikethrough) e carimbos de assinatura digital (`ICP-Brasil`, códigos verificadores);
  - Converter tabelas (como quadros de dotações orçamentárias) em prosa natural para leitura em voz alta;
  - Converter números, valores monetários (`R$`), datas, `nº`, `§`, artigos e incisos romanos por extenso;
  - Respeitar páginas marcadas pelo operador como `🚫 Não ler esta página` (`pular = true`).
- **Geração de Áudio (TTS)**:
  - Gerar áudio em velocidade `1.0x` com cache determinístico por hash (`pauta_{id}_pag_{num}_{voz}_h{hashTexto}`), aplicando a velocidade (`0.85x` a `1.25x`) via `playbackRate` no navegador e ganho de volume via Web Audio API (`GainNode`).

## 3. Rolagem Ancorada no Texto (PDF.js Teleprompter)
- Extrair coordenadas verticais (`tx[5]`) de `page.getTextContent()`, descartando textos verticais de margem e blocos após marcadores de assinatura digital.
- Casar palavras-marco (`>= 4` letras) entre o PDF e o texto revisado para calcular âncoras `{ y, frac }` monotônicas.
- Manter a linha de leitura ativa posicionada a `~42%` da altura útil do container e limitar o scroll final à base real do texto (`pageContentBottomY`), evitando rolar para áreas em branco.
