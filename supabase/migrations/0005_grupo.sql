-- Invest+ — grupo de pessoas e lançamentos compartilhados.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run.
--
-- Modelo: cada pessoa tem o próprio financeiro (espaço). Pessoas conectadas formam um grupo:
-- cada uma vê do outro SOMENTE os lançamentos marcados como "compartilhado", sem poder editar.
-- Ao conectar, cada uma vira automaticamente uma Pessoa no financeiro da outra.

-- Corrige o erro "function gen_random_bytes(integer) does not exist": o pgcrypto do Supabase fica no
-- schema "extensions". Agora o código usa gen_random_uuid() (nativo) e tem 12 caracteres.
create or replace function public.novo_codigo()
returns text language sql volatile set search_path = public as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

-- ---------- Conexões (grupo) ----------
create table if not exists public.conexoes (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists conexoes_b_idx on public.conexoes(user_b);
alter table public.conexoes enable row level security;
drop policy if exists conexoes_ler on public.conexoes;
create policy conexoes_ler on public.conexoes for select to authenticated using (auth.uid() in (user_a, user_b));

create or replace function public.conectados(p_user uuid, p_outro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conexoes where user_a = least(p_user, p_outro) and user_b = greatest(p_user, p_outro));
$$;

-- Convites agora conectam pessoas (não entram no financeiro do outro).
alter table public.convites add column if not exists tipo text not null default 'conexao';

-- Pessoa criada automaticamente aponta para o usuário do grupo.
alter table public.pessoas add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Lançamento visível para o grupo.
alter table public.lancamentos add column if not exists compartilhado boolean not null default false;
create index if not exists lancamentos_compart_idx on public.lancamentos(espaco_id, atualizado_em) where compartilhado;

-- Espaço próprio (onde a pessoa é dona), para receber a Pessoa criada automaticamente.
create or replace function public.espaco_proprio(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.espaco_id from public.membros m where m.user_id = p_user and m.papel = 'dono' order by m.criado_em limit 1;
$$;

-- ---------- Funções chamadas pelo app ----------
create or replace function public.gerar_convite_grupo()
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text; v_esp uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  v_esp := public.espaco_proprio(auth.uid());
  if v_esp is null then v_esp := public.garantir_espaco(); end if;
  -- Reaproveita um convite ainda válido para não acumular códigos.
  select codigo into v_codigo from public.convites
    where criado_por = auth.uid() and tipo = 'conexao' and usado_por is null and expira_em > now() + interval '1 day'
    order by expira_em desc limit 1;
  if v_codigo is null then
    v_codigo := public.novo_codigo();
    insert into public.convites (codigo, espaco_id, criado_por, tipo) values (v_codigo, v_esp, auth.uid(), 'conexao');
  end if;
  return v_codigo;
end $$;

-- Mostra quem convidou, para a tela de cadastro ("Marco convidou você"). Não revela mais nada.
create or replace function public.ver_convite(p_codigo text)
returns table (nome text, valido boolean) language sql stable security definer set search_path = public as $$
  select coalesce(p.nome, 'Alguém'), (c.usado_por is null and c.expira_em > now())
  from public.convites c left join public.perfis p on p.user_id = c.criado_por
  where c.codigo = upper(trim(p_codigo)) limit 1;
$$;

-- Aceita: conecta as duas pessoas e cria a Pessoa de cada uma no financeiro da outra.
create or replace function public.aceitar_convite_grupo(p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare v_conv public.convites; v_eu uuid := auth.uid(); v_meu_esp uuid; v_esp_dele uuid; v_meu_nome text; v_nome_dele text;
begin
  if v_eu is null then raise exception 'É preciso estar logado.'; end if;
  select * into v_conv from public.convites where codigo = upper(trim(p_codigo)) for update;
  if v_conv.codigo is null then raise exception 'Convite não encontrado. Confira o código.'; end if;
  if v_conv.criado_por = v_eu then raise exception 'Este convite é seu. Envie para outra pessoa.'; end if;
  if public.conectados(v_eu, v_conv.criado_por) then return coalesce((select nome from public.perfis where user_id = v_conv.criado_por), 'Alguém'); end if;
  if v_conv.usado_por is not null then raise exception 'Este convite já foi usado. Peça um novo.'; end if;
  if v_conv.expira_em < now() then raise exception 'Este convite expirou. Peça um novo.'; end if;

  insert into public.conexoes (user_a, user_b) values (least(v_eu, v_conv.criado_por), greatest(v_eu, v_conv.criado_por)) on conflict do nothing;
  update public.convites set usado_por = v_eu, usado_em = now() where codigo = v_conv.codigo;

  v_meu_esp := coalesce(public.espaco_proprio(v_eu), public.garantir_espaco());
  v_esp_dele := public.espaco_proprio(v_conv.criado_por);
  select nome into v_meu_nome from public.perfis where user_id = v_eu;
  select nome into v_nome_dele from public.perfis where user_id = v_conv.criado_por;

  insert into public.pessoas (espaco_id, id, nome, tipo, observacao, user_id)
    values (v_meu_esp, 'grupo-' || v_conv.criado_por, coalesce(v_nome_dele, 'Pessoa do grupo'), 'outro', 'Do seu grupo no Invest+', v_conv.criado_por)
    on conflict (espaco_id, id) do update set excluido = false, user_id = excluded.user_id;
  if v_esp_dele is not null then
    insert into public.pessoas (espaco_id, id, nome, tipo, observacao, user_id)
      values (v_esp_dele, 'grupo-' || v_eu, coalesce(v_meu_nome, 'Pessoa do grupo'), 'outro', 'Do seu grupo no Invest+', v_eu)
      on conflict (espaco_id, id) do update set excluido = false, user_id = excluded.user_id;
  end if;
  return coalesce(v_nome_dele, 'Alguém');
end $$;

-- Pessoas do meu grupo.
create or replace function public.meu_grupo()
returns table (user_id uuid, nome text, desde timestamptz) language sql stable security definer set search_path = public as $$
  select o.outro, coalesce(p.nome, 'Sem nome'), c.criado_em
  from public.conexoes c
  cross join lateral (select case when c.user_a = auth.uid() then c.user_b else c.user_a end as outro) o
  left join public.perfis p on p.user_id = o.outro
  where auth.uid() in (c.user_a, c.user_b)
  order by c.criado_em;
$$;

-- Sair do grupo com uma pessoa (os dois deixam de ver os compartilhados um do outro).
create or replace function public.desconectar(p_outro uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.conexoes where user_a = least(auth.uid(), p_outro) and user_b = greatest(auth.uid(), p_outro);
end $$;

-- Lançamentos compartilhados comigo, alterados desde a data informada (para a sincronização).
-- Linhas que deixaram de ser compartilhadas voltam só com o id e "visivel = false", sem os dados.
create or replace function public.compartilhados_desde(p_desde timestamptz)
returns table (id text, autor_id uuid, autor_nome text, visivel boolean, tipo text, descricao text, valor bigint, data date,
               vencimento date, status text, categoria_nome text, categoria_cor text, observacao text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  with donos as (
    select m.espaco_id, m.user_id from public.membros m
    where m.papel = 'dono' and public.conectados(auth.uid(), m.user_id) and m.user_id <> auth.uid()
  )
  select l.id, d.user_id, coalesce(p.nome, 'Alguém'), (l.compartilhado and not l.excluido),
    case when l.compartilhado and not l.excluido then l.tipo end,
    case when l.compartilhado and not l.excluido then l.descricao end,
    case when l.compartilhado and not l.excluido then l.valor end,
    case when l.compartilhado and not l.excluido then l.data end,
    case when l.compartilhado and not l.excluido then l.vencimento end,
    case when l.compartilhado and not l.excluido then l.status end,
    case when l.compartilhado and not l.excluido then c.nome end,
    case when l.compartilhado and not l.excluido then c.cor end,
    case when l.compartilhado and not l.excluido then l.observacao end,
    l.atualizado_em
  from donos d
  join public.lancamentos l on l.espaco_id = d.espaco_id and l.atualizado_em > p_desde
  left join public.categorias c on c.espaco_id = l.espaco_id and c.id = l.categoria_id
  left join public.perfis p on p.user_id = d.user_id
  order by l.atualizado_em
  limit 2000;
$$;

revoke all on function public.novo_codigo(), public.conectados(uuid, uuid), public.espaco_proprio(uuid) from public, anon, authenticated;
revoke all on function public.gerar_convite_grupo(), public.aceitar_convite_grupo(text), public.meu_grupo(), public.desconectar(uuid), public.compartilhados_desde(timestamptz) from public, anon;
grant execute on function public.gerar_convite_grupo(), public.aceitar_convite_grupo(text), public.meu_grupo(), public.desconectar(uuid), public.compartilhados_desde(timestamptz) to authenticated;
revoke all on function public.ver_convite(text) from public;
grant execute on function public.ver_convite(text) to anon, authenticated;

-- O convite antigo (entrar no financeiro inteiro do outro) usa o mesmo gerador de código.
create or replace function public.gerar_convite(p_espaco uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if not public.eh_dono(p_espaco) then raise exception 'Só o dono do espaço pode convidar.'; end if;
  v_codigo := public.novo_codigo();
  insert into public.convites (codigo, espaco_id, criado_por, tipo) values (v_codigo, p_espaco, auth.uid(), 'espaco');
  return v_codigo;
end $$;
