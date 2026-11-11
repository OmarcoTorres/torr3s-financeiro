-- Plataforma (Invest+ · Vida+ · Kaya Life) — módulos por conta e o cofre criptografado do Kaya Life.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run. Pode rodar mais de uma vez.
--
-- Kaya Life: criptografia de ponta a ponta. O aparelho cifra tudo (AES-GCM 256) ANTES de enviar;
-- o servidor guarda só blocos ilegíveis. Nem o banco, nem quem administra o Supabase, consegue ler.
-- - kaya_itens: um bloco cifrado por registro. Nem o TIPO do registro (uso, diário, sintoma…) fica visível.
-- - kaya_chaves: a chave dos dados embrulhada pelo CÓDIGO DE RECUPERAÇÃO (128 bits, só a pessoa tem).
--   O PIN nunca vai para o servidor: a chave embrulhada pelo PIN fica só no aparelho.

-- ---------- Módulos por conta (feature flag) ----------
create table if not exists public.modulos_conta (
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null check (modulo in ('invest', 'vida', 'kaya')),
  ativo boolean not null default true,
  plano text not null default 'gratis' check (plano in ('gratis', 'premium')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, modulo)
);
alter table public.modulos_conta enable row level security;
drop policy if exists modulos_ler on public.modulos_conta;
drop policy if exists modulos_criar on public.modulos_conta;
drop policy if exists modulos_alterar on public.modulos_conta;
create policy modulos_ler on public.modulos_conta for select to authenticated using (user_id = auth.uid());
-- A pessoa liga/desliga os módulos dela; o plano só muda pelo servidor (sem policy para a coluna plano).
create policy modulos_criar on public.modulos_conta for insert to authenticated with check (user_id = auth.uid() and plano = 'gratis');
create policy modulos_alterar on public.modulos_conta for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and plano = (select m.plano from public.modulos_conta m where m.user_id = auth.uid() and m.modulo = modulos_conta.modulo));

-- ---------- Kaya Life: cofre ----------
create table if not exists public.kaya_chaves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  versao int not null default 1,
  sal text not null,          -- base64, PBKDF2
  iteracoes int not null check (iteracoes >= 310000),
  iv text not null,           -- base64
  chave_embrulhada text not null, -- chave dos dados cifrada com a chave derivada do código de recuperação
  criado_em timestamptz not null default now()
);

create table if not exists public.kaya_itens (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null check (length(id) between 8 and 64),
  iv text not null check (length(iv) between 12 and 32),
  dados text not null check (length(dados) <= 200000),   -- AES-GCM, base64
  atualizado_em timestamptz not null default now(),
  excluido boolean not null default false,
  primary key (user_id, id)
);
create index if not exists kaya_itens_sync_idx on public.kaya_itens(user_id, atualizado_em);

create or replace function public.kaya_tocar()
returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em := clock_timestamp(); return new; end $$;
drop trigger if exists kaya_itens_tocar on public.kaya_itens;
create trigger kaya_itens_tocar before insert or update on public.kaya_itens for each row execute function public.kaya_tocar();

alter table public.kaya_chaves enable row level security;
alter table public.kaya_itens enable row level security;
drop policy if exists kaya_chaves_ler on public.kaya_chaves;
drop policy if exists kaya_chaves_criar on public.kaya_chaves;
drop policy if exists kaya_chaves_alterar on public.kaya_chaves;
create policy kaya_chaves_ler on public.kaya_chaves for select to authenticated using (user_id = auth.uid());
create policy kaya_chaves_criar on public.kaya_chaves for insert to authenticated with check (user_id = auth.uid());
create policy kaya_chaves_alterar on public.kaya_chaves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists kaya_itens_ler on public.kaya_itens;
drop policy if exists kaya_itens_criar on public.kaya_itens;
drop policy if exists kaya_itens_alterar on public.kaya_itens;
create policy kaya_itens_ler on public.kaya_itens for select to authenticated using (user_id = auth.uid());
create policy kaya_itens_criar on public.kaya_itens for insert to authenticated with check (user_id = auth.uid());
create policy kaya_itens_alterar on public.kaya_itens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- sem policy de delete: excluir tudo só pela função abaixo (apaga de verdade, não marca).

-- Excluir tudo do Kaya Life desta conta (itens + cofre + flag). Sem volta.
create or replace function public.kaya_excluir_tudo()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  delete from public.kaya_itens where user_id = auth.uid();
  get diagnostics n = row_count;
  delete from public.kaya_chaves where user_id = auth.uid();
  delete from public.modulos_conta where user_id = auth.uid() and modulo = 'kaya';
  return n;
end $$;
revoke all on function public.kaya_excluir_tudo() from public, anon;
grant execute on function public.kaya_excluir_tudo() to authenticated;
revoke all on function public.kaya_tocar() from public, anon, authenticated;
