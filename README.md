# Invest+

Dashboard financeiro para você ou para a sua empresa: transações, cartões de crédito, metas, lançamentos, pessoas, fechamento mensal, relatórios editáveis, leitura de conta por foto e um mini assistente.

- **Dados**: Supabase (Postgres + RLS por espaço) com login por e-mail e senha. O app grava primeiro no aparelho (IndexedDB) e sincroniza com a nuvem; funciona sem internet. Esquema em `supabase/migrations/0001_inicial.sql`.
- **Compartilhar**: cada usuário tem um espaço pessoal; o dono gera um código em *Ajustes › Conta e compartilhamento* e a outra pessoa entra com ele.
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

## Notificações

- Banco: `supabase/migrations/0002_notificacoes.sql` (inscrições por aparelho e preferências).
- Envio: `api/lembretes.ts`, chamado pelo Vercel Cron todo dia às 8h de Brasília (`vercel.json`); regras em `api/_regras-lembretes.ts`.
- Variáveis na Vercel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
