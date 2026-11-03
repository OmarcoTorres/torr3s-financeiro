-- Invest+ — esquema inicial.
-- Rode uma vez no Supabase: SQL Editor › New query › cole tudo › Run.
-- Modelo: cada usuário tem um ou mais "espaços" (o pessoal e, se quiser, um compartilhado com outra pessoa).
-- Todo dado financeiro pertence a um espaço; o RLS libera só para quem é membro dele.

create extension if not exists pgcrypto;

-- ---------- Espaços e membros ----------
create table public.espacos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_por uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table public.membros (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  criado_em timestamptz not null default now(),
  primary key (espaco_id, user_id)
);
create index membros_user_idx on public.membros(user_id);

create table public.convites (
  codigo text primary key,
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  criado_por uuid not null references auth.users(id) on delete cascade,
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id) on delete set null,
  usado_em timestamptz
);

create table public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  idade int check (idade between 12 and 110),
  uso text not null default 'pessoal' check (uso in ('pessoal', 'empresa')),
  empresa text,
  objetivo text not null default 'organizar',
  meta bigint,
  espaco_atual uuid references public.espacos(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Membro do espaço? (SECURITY DEFINER evita recursão de RLS na própria tabela membros.)
create or replace function public.eh_membro(p_espaco uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros m where m.espaco_id = p_espaco and m.user_id = auth.uid());
$$;

create or replace function public.eh_dono(p_espaco uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros m where m.espaco_id = p_espaco and m.user_id = auth.uid() and m.papel = 'dono');
$$;

-- ---------- Dados financeiros (chave: espaço + id gerado no app) ----------
create table public.contas (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  nome text not null,
  saldo_inicial bigint not null default 0,
  cor text not null default '#5b5bd6',
  tipo text not null default 'conta' check (tipo in ('conta', 'cartao')),
  limite bigint,
  vencimento_dia int check (vencimento_dia between 1 and 31),
  final text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

create table public.categorias (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  nome text not null,
  tipo text not null check (tipo in ('receita', 'despesa')),
  cor text not null,
  icone text not null default 'tag',
  pai_id text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

create table public.pessoas (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  nome text not null,
  tipo text not null default 'outro',
  telefone text,
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

create table public.lancamentos (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  tipo text not null check (tipo in ('receita', 'despesa', 'transferencia')),
  descricao text not null,
  valor bigint not null check (valor >= 0),
  data date not null,
  vencimento date,
  categoria_id text,
  conta_id text,
  conta_destino_id text,
  pessoa_id text,
  status text not null check (status in ('pago', 'pendente')),
  observacao text,
  foto_id text,
  grupo text,
  parcela int,
  total_parcelas int,
  recorrente boolean,
  divisao jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);
create index lancamentos_data_idx on public.lancamentos(espaco_id, data);

create table public.metas (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  nome text not null,
  alvo bigint not null,
  guardado bigint not null default 0,
  prazo text,
  icone text not null default 'piggy',
  cor text not null,
  aportes jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

create table public.fechamentos (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null, -- AAAA-MM
  fechado_em timestamptz not null default now(),
  resumo jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

create table public.relatorios (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  nome text not null,
  config jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

create table public.fotos (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  id text not null,
  caminho text not null, -- caminho no bucket "fotos": <espaco_id>/<id>.jpg
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido boolean not null default false,
  primary key (espaco_id, id)
);

-- atualizado_em sempre pelo servidor (base da sincronização incremental).
create or replace function public.tocar_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['contas','categorias','pessoas','lancamentos','metas','fechamentos','relatorios','fotos'] loop
    execute format('create index %1$s_sync_idx on public.%1$s(espaco_id, atualizado_em)', t);
    execute format('create trigger %1$s_tocar before insert or update on public.%1$s for each row execute function public.tocar_atualizado()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (public.eh_membro(espaco_id))', t);
    execute format('create policy %1$s_criar on public.%1$s for insert to authenticated with check (public.eh_membro(espaco_id))', t);
    execute format('create policy %1$s_alterar on public.%1$s for update to authenticated using (public.eh_membro(espaco_id)) with check (public.eh_membro(espaco_id))', t);
    execute format('create policy %1$s_apagar on public.%1$s for delete to authenticated using (public.eh_membro(espaco_id))', t);
  end loop;
end $$;

-- ---------- RLS de espaços, membros, convites e perfis ----------
alter table public.espacos enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.perfis enable row level security;

create policy espacos_ler on public.espacos for select to authenticated using (public.eh_membro(id));
create policy espacos_renomear on public.espacos for update to authenticated using (public.eh_dono(id)) with check (public.eh_dono(id));
-- criação de espaço só pelas funções abaixo (sem policy de insert).

create policy membros_ler on public.membros for select to authenticated using (public.eh_membro(espaco_id));
create policy membros_sair on public.membros for delete to authenticated using (user_id = auth.uid() or public.eh_dono(espaco_id));

create policy convites_ler on public.convites for select to authenticated using (public.eh_dono(espaco_id));
create policy convites_apagar on public.convites for delete to authenticated using (public.eh_dono(espaco_id));

create policy perfis_ler on public.perfis for select to authenticated using (user_id = auth.uid());
create policy perfis_criar on public.perfis for insert to authenticated with check (user_id = auth.uid());
create policy perfis_alterar on public.perfis for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Funções chamadas pelo app ----------
-- Garante o espaço pessoal do usuário (idempotente) e devolve o espaço atual.
create or replace function public.garantir_espaco()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_esp uuid;
begin
  if v_user is null then raise exception 'É preciso estar logado.'; end if;
  select espaco_atual into v_esp from public.perfis where user_id = v_user;
  if v_esp is not null and exists (select 1 from public.membros where espaco_id = v_esp and user_id = v_user) then
    return v_esp;
  end if;
  select m.espaco_id into v_esp from public.membros m where m.user_id = v_user order by m.criado_em limit 1;
  if v_esp is null then
    insert into public.espacos (nome, criado_por) values ('Pessoal', v_user) returning id into v_esp;
    insert into public.membros (espaco_id, user_id, papel) values (v_esp, v_user, 'dono');
  end if;
  update public.perfis set espaco_atual = v_esp where user_id = v_user;
  return v_esp;
end $$;

-- Gera um código de convite (válido 7 dias) para o espaço; só o dono pode.
create or replace function public.gerar_convite(p_espaco uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if not public.eh_dono(p_espaco) then raise exception 'Só o dono do espaço pode convidar.'; end if;
  v_codigo := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  insert into public.convites (codigo, espaco_id, criado_por) values (v_codigo, p_espaco, auth.uid());
  return v_codigo;
end $$;

-- Entra num espaço com o código recebido e passa a usá-lo como espaço atual.
create or replace function public.aceitar_convite(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_conv public.convites;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  select * into v_conv from public.convites where codigo = upper(trim(p_codigo)) for update;
  if v_conv.codigo is null then raise exception 'Código de convite não encontrado.'; end if;
  if v_conv.usado_por is not null then raise exception 'Este convite já foi usado.'; end if;
  if v_conv.expira_em < now() then raise exception 'Este convite expirou. Peça um novo.'; end if;
  insert into public.membros (espaco_id, user_id, papel) values (v_conv.espaco_id, auth.uid(), 'membro') on conflict do nothing;
  update public.convites set usado_por = auth.uid(), usado_em = now() where codigo = v_conv.codigo;
  update public.perfis set espaco_atual = v_conv.espaco_id where user_id = auth.uid();
  return v_conv.espaco_id;
end $$;

-- Troca o espaço atual (precisa ser membro).
create or replace function public.usar_espaco(p_espaco uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_membro(p_espaco) then raise exception 'Você não participa deste espaço.'; end if;
  update public.perfis set espaco_atual = p_espaco where user_id = auth.uid();
  return p_espaco;
end $$;

-- Lista os espaços do usuário com os membros (nome do perfil de cada um).
create or replace function public.meus_espacos()
returns table (id uuid, nome text, papel text, membros jsonb) language sql stable security definer set search_path = public as $$
  select e.id, e.nome, m.papel,
    (select jsonb_agg(jsonb_build_object('user_id', m2.user_id, 'papel', m2.papel, 'nome', coalesce(p.nome, 'Sem nome')) order by m2.criado_em)
       from public.membros m2 left join public.perfis p on p.user_id = m2.user_id where m2.espaco_id = e.id)
  from public.espacos e join public.membros m on m.espaco_id = e.id and m.user_id = auth.uid()
  order by m.criado_em;
$$;

revoke all on function public.garantir_espaco(), public.gerar_convite(uuid), public.aceitar_convite(text), public.usar_espaco(uuid), public.meus_espacos() from public, anon;
grant execute on function public.garantir_espaco(), public.gerar_convite(uuid), public.aceitar_convite(text), public.usar_espaco(uuid), public.meus_espacos() to authenticated;
revoke all on function public.eh_membro(uuid), public.eh_dono(uuid) from anon;

-- ---------- Fotos das contas (Storage privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.eh_membro(((storage.foldername(name))[1])::uuid));
create policy fotos_criar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_membro(((storage.foldername(name))[1])::uuid));
create policy fotos_alterar on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.eh_membro(((storage.foldername(name))[1])::uuid));
create policy fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.eh_membro(((storage.foldername(name))[1])::uuid));
