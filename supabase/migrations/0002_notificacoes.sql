-- Invest+ — notificações push.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run.

-- Cada aparelho que aceitou notificações (um usuário pode ter iPhone e computador).
create table public.push_assinaturas (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz,
  falhas int not null default 0
);
create index push_assinaturas_user_idx on public.push_assinaturas(user_id);

-- O que cada pessoa quer receber.
create table public.notificacoes_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  vencimentos boolean not null default true,  -- contas a pagar e a receber
  dias_antes int not null default 2 check (dias_antes between 0 and 10),
  atrasadas boolean not null default true,
  faturas boolean not null default true,      -- vencimento da fatura do cartão
  metas boolean not null default true,        -- prazo de meta chegando
  resumo_semanal boolean not null default true, -- segunda-feira: resumo da semana
  atualizado_em timestamptz not null default now()
);

alter table public.push_assinaturas enable row level security;
alter table public.notificacoes_prefs enable row level security;

create policy push_ler on public.push_assinaturas for select to authenticated using (user_id = auth.uid());
create policy push_criar on public.push_assinaturas for insert to authenticated with check (user_id = auth.uid());
create policy push_alterar on public.push_assinaturas for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_apagar on public.push_assinaturas for delete to authenticated using (user_id = auth.uid());

create policy prefs_ler on public.notificacoes_prefs for select to authenticated using (user_id = auth.uid());
create policy prefs_criar on public.notificacoes_prefs for insert to authenticated with check (user_id = auth.uid());
create policy prefs_alterar on public.notificacoes_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
