-- Invest+ — grupos de verdade (com tipo: casal, irmãos, estudo, empresa…) e metas compartilhadas.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run. Pode rodar mais de uma vez.
--
-- Modelo:
-- - Grupo tem nome e tipo; o tipo muda a temática do app (mensagens e cores) de quem está nele.
-- - Convite pode ser para um grupo: quem aceita entra no grupo e fica conectado a todos os membros
--   (a conexão em pares continua valendo para os lançamentos compartilhados, como antes).
-- - Meta compartilhada: continua no financeiro do dono (só ele edita nome/alvo/prazo); o grupo vê o
--   progresso e guarda junto. O que os outros guardam fica em meta_aportes_grupo (tabela separada),
--   para nunca ser sobrescrito pela sincronização do aparelho do dono.

-- ---------- Tabelas ----------
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 60),
  tipo text not null default 'outro' check (tipo in ('casal','irmaos','familia','amigos','estudo','empresa','outro')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.grupo_membros (
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('dono','membro')),
  criado_em timestamptz not null default now(),
  primary key (grupo_id, user_id)
);
create index if not exists grupo_membros_user_idx on public.grupo_membros(user_id);

alter table public.convites add column if not exists grupo_id uuid references public.grupos(id) on delete cascade;
alter table public.metas add column if not exists grupo_id uuid references public.grupos(id) on delete set null;

create table if not exists public.meta_aportes_grupo (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null,
  meta_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  valor bigint not null check (valor > 0),
  data date not null default current_date,
  criado_em timestamptz not null default now(),
  foreign key (espaco_id, meta_id) references public.metas(espaco_id, id) on delete cascade
);
create index if not exists meta_aportes_grupo_meta_idx on public.meta_aportes_grupo(espaco_id, meta_id);

-- ---------- Acesso: tudo passa pelas funções abaixo ----------
create or replace function public.eh_do_grupo(p_grupo uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grupo_membros where grupo_id = p_grupo and user_id = p_user);
$$;

alter table public.grupos enable row level security;
alter table public.grupo_membros enable row level security;
alter table public.meta_aportes_grupo enable row level security;
drop policy if exists grupos_ler on public.grupos;
create policy grupos_ler on public.grupos for select to authenticated using (public.eh_do_grupo(id));
drop policy if exists grupo_membros_ler on public.grupo_membros;
create policy grupo_membros_ler on public.grupo_membros for select to authenticated using (public.eh_do_grupo(grupo_id));
-- meta_aportes_grupo: sem policy de leitura/escrita direta; só pelas funções.

-- Conecta duas pessoas (como o convite antigo): conexão + cada uma vira Pessoa no financeiro da outra.
create or replace function public.conectar_par(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_esp_a uuid; v_esp_b uuid; v_nome_a text; v_nome_b text;
begin
  if p_a = p_b then return; end if;
  insert into public.conexoes (user_a, user_b) values (least(p_a, p_b), greatest(p_a, p_b)) on conflict do nothing;
  v_esp_a := public.espaco_proprio(p_a);
  v_esp_b := public.espaco_proprio(p_b);
  select nome into v_nome_a from public.perfis where user_id = p_a;
  select nome into v_nome_b from public.perfis where user_id = p_b;
  if v_esp_a is not null then
    insert into public.pessoas (espaco_id, id, nome, tipo, observacao, user_id)
      values (v_esp_a, 'grupo-' || p_b, coalesce(v_nome_b, 'Pessoa do grupo'), 'outro', 'Do seu grupo no Invest+', p_b)
      on conflict (espaco_id, id) do update set excluido = false, user_id = excluded.user_id;
  end if;
  if v_esp_b is not null then
    insert into public.pessoas (espaco_id, id, nome, tipo, observacao, user_id)
      values (v_esp_b, 'grupo-' || p_a, coalesce(v_nome_a, 'Pessoa do grupo'), 'outro', 'Do seu grupo no Invest+', p_a)
      on conflict (espaco_id, id) do update set excluido = false, user_id = excluded.user_id;
  end if;
end $$;

-- ---------- Grupos ----------
create or replace function public.criar_grupo(p_nome text, p_tipo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  insert into public.grupos (nome, tipo, criado_por) values (trim(p_nome), coalesce(p_tipo, 'outro'), auth.uid()) returning id into v_id;
  insert into public.grupo_membros (grupo_id, user_id, papel) values (v_id, auth.uid(), 'dono');
  return v_id;
end $$;

-- Qualquer membro ajusta nome e tipo (num casal, os dois decidem).
create or replace function public.atualizar_grupo(p_grupo uuid, p_nome text, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_do_grupo(p_grupo) then raise exception 'Você não faz parte deste grupo.'; end if;
  update public.grupos set nome = coalesce(nullif(trim(p_nome), ''), nome), tipo = coalesce(p_tipo, tipo) where id = p_grupo;
end $$;

create or replace function public.meus_grupos()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'nome', g.nome, 'tipo', g.tipo, 'criado_em', g.criado_em,
    'papel', eu.papel,
    'membros', (select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'nome', coalesce(p.nome, 'Sem nome'), 'papel', m.papel, 'desde', m.criado_em) order by m.criado_em)
                from public.grupo_membros m left join public.perfis p on p.user_id = m.user_id where m.grupo_id = g.id)
  ) order by g.criado_em), '[]'::jsonb)
  from public.grupos g join public.grupo_membros eu on eu.grupo_id = g.id and eu.user_id = auth.uid();
$$;

-- Sair: tira a pessoa do grupo, descompartilha as metas dela com esse grupo e desfaz conexões
-- com quem não divide mais nenhum grupo. Grupo vazio é apagado.
create or replace function public.sair_do_grupo(p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := auth.uid(); v_outro uuid;
begin
  if not public.eh_do_grupo(p_grupo) then return; end if;
  delete from public.grupo_membros where grupo_id = p_grupo and user_id = v_eu;
  update public.metas set grupo_id = null where grupo_id = p_grupo and public.eh_membro(espaco_id);
  for v_outro in select user_id from public.grupo_membros where grupo_id = p_grupo loop
    if not exists (select 1 from public.grupo_membros a join public.grupo_membros b on a.grupo_id = b.grupo_id
                   where a.user_id = v_eu and b.user_id = v_outro) then
      delete from public.conexoes where user_a = least(v_eu, v_outro) and user_b = greatest(v_eu, v_outro);
    end if;
  end loop;
  if not exists (select 1 from public.grupo_membros where grupo_id = p_grupo) then delete from public.grupos where id = p_grupo; end if;
end $$;

-- ---------- Convites para um grupo ----------
create or replace function public.gerar_convite_grupo(p_grupo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text; v_esp uuid;
begin
  if not public.eh_do_grupo(p_grupo) then raise exception 'Você não faz parte deste grupo.'; end if;
  v_esp := coalesce(public.espaco_proprio(auth.uid()), public.garantir_espaco());
  select codigo into v_codigo from public.convites
    where criado_por = auth.uid() and tipo = 'conexao' and grupo_id = p_grupo and usado_por is null and expira_em > now() + interval '1 day'
    order by expira_em desc limit 1;
  if v_codigo is null then
    v_codigo := public.novo_codigo();
    insert into public.convites (codigo, espaco_id, criado_por, tipo, grupo_id) values (v_codigo, v_esp, auth.uid(), 'conexao', p_grupo);
  end if;
  return v_codigo;
end $$;

-- Aceitar: conecta com quem convidou (como antes) e, se o convite é de um grupo, entra nele e conecta com todos.
create or replace function public.aceitar_convite_grupo(p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare v_conv public.convites; v_eu uuid := auth.uid(); v_nome_dele text; v_outro uuid;
begin
  if v_eu is null then raise exception 'É preciso estar logado.'; end if;
  select * into v_conv from public.convites where codigo = upper(trim(p_codigo)) for update;
  if v_conv.codigo is null then raise exception 'Convite não encontrado. Confira o código.'; end if;
  if v_conv.criado_por = v_eu then raise exception 'Este convite é seu. Envie para outra pessoa.'; end if;
  if v_conv.destinatario is not null and v_conv.destinatario <> v_eu then raise exception 'Este convite foi enviado para outra pessoa.'; end if;
  select nome into v_nome_dele from public.perfis where user_id = v_conv.criado_por;
  -- Já usado por mim (link aberto de novo): não dá erro.
  if v_conv.usado_por = v_eu then return coalesce(v_nome_dele, 'Alguém'); end if;
  if v_conv.usado_por is not null then raise exception 'Este convite já foi usado. Peça um novo.'; end if;
  if v_conv.expira_em < now() then raise exception 'Este convite expirou. Peça um novo.'; end if;

  perform public.garantir_espaco();
  update public.convites set usado_por = v_eu, usado_em = now() where codigo = v_conv.codigo;
  perform public.conectar_par(v_eu, v_conv.criado_por);
  if v_conv.grupo_id is not null and exists (select 1 from public.grupos where id = v_conv.grupo_id) then
    insert into public.grupo_membros (grupo_id, user_id, papel) values (v_conv.grupo_id, v_eu, 'membro') on conflict do nothing;
    for v_outro in select user_id from public.grupo_membros where grupo_id = v_conv.grupo_id and user_id <> v_eu loop
      perform public.conectar_par(v_eu, v_outro);
    end loop;
  end if;
  return coalesce(v_nome_dele, 'Alguém');
end $$;

-- ---------- Metas do grupo ----------
-- Metas compartilhadas nos meus grupos (as minhas e as dos outros), com o que cada pessoa guardou.
-- Só aparece se o dono da meta ainda está no grupo.
create or replace function public.metas_do_grupo()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'espaco_id', m.espaco_id, 'id', m.id, 'nome', m.nome, 'alvo', m.alvo, 'guardado', m.guardado, 'prazo', m.prazo,
    'icone', m.icone, 'cor', m.cor, 'grupo_id', m.grupo_id, 'dono_id', d.user_id, 'dono_nome', coalesce(pd.nome, 'Alguém'),
    'minha', public.eh_membro(m.espaco_id),
    'aportes', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'user_id', a.user_id, 'nome', coalesce(pa.nome, 'Alguém'), 'valor', a.valor, 'data', a.data) order by a.criado_em), '[]'::jsonb)
                from public.meta_aportes_grupo a left join public.perfis pa on pa.user_id = a.user_id
                where a.espaco_id = m.espaco_id and a.meta_id = m.id)
  ) order by m.criado_em), '[]'::jsonb)
  from public.metas m
  join public.membros d on d.espaco_id = m.espaco_id and d.papel = 'dono'
  left join public.perfis pd on pd.user_id = d.user_id
  where not m.excluido and m.grupo_id is not null
    and public.eh_do_grupo(m.grupo_id) and public.eh_do_grupo(m.grupo_id, d.user_id);
$$;

create or replace function public.aportar_meta_grupo(p_espaco uuid, p_meta text, p_valor bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_grupo uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor.'; end if;
  select grupo_id into v_grupo from public.metas where espaco_id = p_espaco and id = p_meta and not excluido;
  if v_grupo is null or not public.eh_do_grupo(v_grupo) then raise exception 'Esta meta não está compartilhada com você.'; end if;
  insert into public.meta_aportes_grupo (espaco_id, meta_id, user_id, valor) values (p_espaco, p_meta, auth.uid(), p_valor) returning id into v_id;
  return v_id;
end $$;

-- Desfaz um aporte: quem guardou, ou o dono da meta.
create or replace function public.remover_aporte_grupo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.meta_aportes_grupo a where a.id = p_id and (a.user_id = auth.uid() or public.eh_membro(a.espaco_id));
end $$;

-- ---------- Convite direto para quem já tem conta (por e-mail) ----------
-- O convite fica endereçado à pessoa: aparece dentro do app dela ("Convites para você") e o servidor
-- manda um push para os aparelhos dela (api/convite-push). Só ela pode aceitar.
alter table public.convites add column if not exists destinatario uuid references auth.users(id) on delete cascade;
alter table public.convites add column if not exists notificado_em timestamptz;
create index if not exists convites_destinatario_idx on public.convites(destinatario) where usado_por is null;

create or replace function public.convidar_por_email(p_email text, p_grupo uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_eu uuid := auth.uid(); v_dest uuid; v_codigo text; v_esp uuid; v_nome text;
begin
  if v_eu is null then raise exception 'É preciso estar logado.'; end if;
  if not public.eh_do_grupo(p_grupo) then raise exception 'Você não faz parte deste grupo.'; end if;
  if (select count(*) from public.convites where criado_por = v_eu and destinatario is not null and expira_em > now() + interval '6 days') >= 20 then
    raise exception 'Muitos convites hoje. Tente de novo amanhã.';
  end if;
  select id into v_dest from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_dest is null then raise exception 'Não achei uma conta no Invest+ com esse e-mail. Envie o convite pelo WhatsApp.'; end if;
  if v_dest = v_eu then raise exception 'Esse e-mail é o seu.'; end if;
  if public.eh_do_grupo(p_grupo, v_dest) then raise exception 'Essa pessoa já está no grupo.'; end if;
  select nome into v_nome from public.perfis where user_id = v_dest;
  select codigo into v_codigo from public.convites
    where criado_por = v_eu and destinatario = v_dest and grupo_id = p_grupo and usado_por is null and expira_em > now()
    order by expira_em desc limit 1;
  if v_codigo is null then
    v_esp := coalesce(public.espaco_proprio(v_eu), public.garantir_espaco());
    v_codigo := public.novo_codigo();
    insert into public.convites (codigo, espaco_id, criado_por, tipo, grupo_id, destinatario)
      values (v_codigo, v_esp, v_eu, 'conexao', p_grupo, v_dest);
  end if;
  return jsonb_build_object('codigo', v_codigo, 'nome', coalesce(v_nome, 'a pessoa'));
end $$;

-- Convites endereçados a mim, ainda válidos.
create or replace function public.convites_para_mim()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('codigo', c.codigo, 'de', coalesce(p.nome, 'Alguém'), 'grupo', g.nome, 'tipo', g.tipo, 'expira_em', c.expira_em) order by c.expira_em desc), '[]'::jsonb)
  from public.convites c
  left join public.perfis p on p.user_id = c.criado_por
  left join public.grupos g on g.id = c.grupo_id
  where c.destinatario = auth.uid() and c.usado_por is null and c.expira_em > now();
$$;

create or replace function public.recusar_convite(p_codigo text)
returns void language sql security definer set search_path = public as $$
  delete from public.convites where codigo = upper(trim(p_codigo)) and destinatario = auth.uid() and usado_por is null;
$$;

-- ---------- Conexões que já existiam viram um grupo (tipo "outro", para a pessoa escolher) ----------
do $$
declare c record; v_id uuid;
begin
  for c in select * from public.conexoes loop
    if not exists (select 1 from public.grupo_membros a join public.grupo_membros b on a.grupo_id = b.grupo_id
                   where a.user_id = c.user_a and b.user_id = c.user_b) then
      insert into public.grupos (nome, tipo, criado_por) values ('Nosso grupo', 'outro', c.user_a) returning id into v_id;
      insert into public.grupo_membros (grupo_id, user_id, papel, criado_em) values (v_id, c.user_a, 'dono', c.criado_em), (v_id, c.user_b, 'membro', c.criado_em);
    end if;
  end loop;
end $$;

revoke all on function public.eh_do_grupo(uuid, uuid), public.conectar_par(uuid, uuid), public.criar_grupo(text, text), public.atualizar_grupo(uuid, text, text),
  public.meus_grupos(), public.sair_do_grupo(uuid), public.gerar_convite_grupo(uuid), public.aceitar_convite_grupo(text),
  public.metas_do_grupo(), public.aportar_meta_grupo(uuid, text, bigint), public.remover_aporte_grupo(uuid),
  public.convidar_por_email(text, uuid), public.convites_para_mim(), public.recusar_convite(text) from public, anon;
grant execute on function public.eh_do_grupo(uuid, uuid), public.criar_grupo(text, text), public.atualizar_grupo(uuid, text, text),
  public.meus_grupos(), public.sair_do_grupo(uuid), public.gerar_convite_grupo(uuid), public.aceitar_convite_grupo(text),
  public.metas_do_grupo(), public.aportar_meta_grupo(uuid, text, bigint), public.remover_aporte_grupo(uuid),
  public.convidar_por_email(text, uuid), public.convites_para_mim(), public.recusar_convite(text) to authenticated;
-- conectar_par fica só para as funções internas (não é chamada pelo app).
