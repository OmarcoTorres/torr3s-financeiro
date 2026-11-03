-- Invest+ — histórico dos avisos (o que o robô e o teste enviaram), mostrado dentro do assistente.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run.

create table if not exists public.avisos_historico (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  corpo text not null,
  url text,
  tag text,
  criado_em timestamptz not null default now(),
  lido_em timestamptz
);
create index if not exists avisos_historico_user_idx on public.avisos_historico(user_id, criado_em desc);

alter table public.avisos_historico enable row level security;
-- Cada pessoa lê e marca como lido só os próprios avisos. Quem grava é o servidor (chave de serviço).
drop policy if exists avisos_ler on public.avisos_historico;
create policy avisos_ler on public.avisos_historico for select to authenticated using (user_id = auth.uid());
drop policy if exists avisos_marcar on public.avisos_historico;
create policy avisos_marcar on public.avisos_historico for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.avisos_historico from anon, authenticated;
grant select, update (lido_em) on public.avisos_historico to authenticated;
