# Tostão

Financeiro do dia a dia, para você ou para a sua empresa: lançamentos, pessoas, fechamento mensal, relatórios editáveis, leitura de conta por foto e um mini assistente.

- **Dados**: ficam só no aparelho (IndexedDB). Exporte backups em *Mais › Backup e dados*.
- **IA** (leitura de conta e assistente): funções em `api/` rodando na Vercel com o Claude. Exige `ANTHROPIC_API_KEY` nas variáveis de ambiente da Vercel.
- **Primeiro acesso**: boas-vindas em 6 etapas (nome, idade, uso pessoal ou empresa, objetivo e meta, saldo inicial) e tour guiado de 8 passos; depois, uma lista de primeiros passos no início.
- **iPhone**: abra o endereço no Safari › Compartilhar › *Adicionar à Tela de Início*.

## Rodar localmente

```bash
npm install
npm run dev        # telas (sem IA)
npx vercel dev     # telas + funções de IA (precisa de .env com ANTHROPIC_API_KEY)
```

## Publicar

Importe o repositório na Vercel (framework Vite, sem mudanças) e configure `ANTHROPIC_API_KEY`. Cada push na `main` publica de novo.

## Estrutura

- `src/db.ts` — tabelas locais e dados de exemplo
- `src/lib/` — cálculos (saldos, situação, fechamento), relatórios, exportação CSV/PDF, backup, chamadas de IA
- `src/pages/` — Início, Lançamentos, Relatórios, Pessoas, Mais
- `src/components/` — formulário de lançamento, leitura de conta, assistente
- `api/` — `ler-conta` e `assistente` (limite de 8 chamadas por minuto por IP)
