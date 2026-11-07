-- Invest+ — caixinha do grupo: conta bancária real (ex.: Itaú do Marco) onde o grupo deposita junto.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run. Pode rodar mais de uma vez.
--
-- O dinheiro NUNCA passa pela plataforma: fica na conta do dono. O app só
-- (1) gera o QR Code Pix para a chave do dono, (2) registra quem disse que pagou e
-- (3) lê saldo e extrato (Open Finance via Meu Pluggy, no servidor) para confirmar os depósitos.

create table if not exists public.caixinhas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null unique references public.grupos(id) on delete cascade,
  dono uuid not null references auth.users(id) on delete cascade,
  nome text not null default 'Caixinha',
  banco text not null default 'Itaú',
  chave_pix text not null check (length(chave_pix) between 3 and 77),
  recebedor text not null check (length(recebedor) between 1 and 60),
  cidade text not null default 'SAO PAULO' check (length(cidade) between 1 and 40),
  pluggy_item_id text,
  pluggy_account_id text,
  saldo bigint,                    -- centavos, última leitura do banco
  saldo_em timestamptz,            -- quando o banco atualizou esse saldo
  lido_em timestamptz,             -- quando o app leu pela última vez
  erro_leitura text,
  criado_em timestamptz not null default now()
);

create table if not exists public.caixinha_depositos (
  id uuid primary key default gen_random_uuid(),
  caixinha_id uuid not null references public.caixinhas(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  valor bigint not null check (valor > 0),
  txid text not null unique,
  status text not null default 'aguardando' check (status in ('aguardando','pago','confirmado','cancelado')),
  meta_espaco uuid,
  meta_id text,
  aporte_id uuid references public.meta_aportes_grupo(id) on delete set null,
  transacao_id text unique,
  confirmado_por text check (confirmado_por in ('banco','manual')),
  criado_em timestamptz not null default now(),
  pago_em timestamptz,
  confirmado_em timestamptz
);
create index if not exists caixinha_depositos_cx_idx on public.caixinha_depositos(caixinha_id, criado_em desc);

alter table public.caixinhas enable row level security;
alter table public.caixinha_depositos enable row level security;
-- Sem policies: tudo pelas funções abaixo (e pelo servidor, com a chave de serviço).

-- Caixinhas dos meus grupos, com os depósitos recentes e o nome de quem depositou.
create or replace function public.minhas_caixinhas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'grupo_id', c.grupo_id, 'dono', c.dono, 'sou_dono', c.dono = auth.uid(), 'nome', c.nome, 'banco', c.banco,
    'chave_pix', c.chave_pix, 'recebedor', c.recebedor, 'cidade', c.cidade,
    'conectado', c.pluggy_item_id is not null, 'pluggy_item_id', case when c.dono = auth.uid() then c.pluggy_item_id end,
    'saldo', c.saldo, 'saldo_em', c.saldo_em, 'lido_em', c.lido_em, 'erro_leitura', c.erro_leitura,
    'depositos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'user_id', d.user_id, 'nome', coalesce(p.nome, 'Alguém'), 'valor', d.valor, 'txid', d.txid, 'status', d.status,
        'meta_espaco', d.meta_espaco, 'meta_id', d.meta_id, 'meta_nome', m.nome, 'confirmado_por', d.confirmado_por,
        'criado_em', d.criado_em, 'pago_em', d.pago_em, 'confirmado_em', d.confirmado_em) order by d.criado_em desc), '[]'::jsonb)
      from (select * from public.caixinha_depositos where caixinha_id = c.id and status <> 'cancelado' order by criado_em desc limit 60) d
      left join public.perfis p on p.user_id = d.user_id
      left join public.metas m on m.espaco_id = d.meta_espaco and m.id = d.meta_id)
  )), '[]'::jsonb)
  from public.caixinhas c where public.eh_do_grupo(c.grupo_id);
$$;

-- Cria ou ajusta a caixinha do grupo. Quem cria vira o dono (a conta é dele); só o dono altera depois.
create or replace function public.salvar_caixinha(p_grupo uuid, p_nome text, p_chave text, p_recebedor text, p_cidade text, p_item text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dono uuid;
begin
  if not public.eh_do_grupo(p_grupo) then raise exception 'Você não faz parte deste grupo.'; end if;
  select id, dono into v_id, v_dono from public.caixinhas where grupo_id = p_grupo;
  if v_id is not null and v_dono <> auth.uid() then raise exception 'Só quem é dono da conta altera a caixinha.'; end if;
  if v_id is null then
    insert into public.caixinhas (grupo_id, dono, nome, chave_pix, recebedor, cidade, pluggy_item_id)
      values (p_grupo, auth.uid(), coalesce(nullif(trim(p_nome), ''), 'Caixinha'), trim(p_chave), trim(p_recebedor), coalesce(nullif(trim(p_cidade), ''), 'SAO PAULO'), nullif(trim(p_item), ''))
      returning id into v_id;
  else
    update public.caixinhas set nome = coalesce(nullif(trim(p_nome), ''), nome), chave_pix = trim(p_chave), recebedor = trim(p_recebedor),
      cidade = coalesce(nullif(trim(p_cidade), ''), cidade),
      pluggy_account_id = case when coalesce(nullif(trim(p_item), ''), '') is distinct from coalesce(pluggy_item_id, '') then null else pluggy_account_id end,
      pluggy_item_id = nullif(trim(p_item), '')
    where id = v_id;
  end if;
  return v_id;
end $$;

-- Novo depósito: devolve o txid que vai dentro do QR Code. Meta opcional (precisa ser do mesmo grupo).
create or replace function public.novo_deposito(p_caixinha uuid, p_valor bigint, p_meta_espaco uuid, p_meta_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_grupo uuid; v_txid text; v_id uuid;
begin
  select grupo_id into v_grupo from public.caixinhas where id = p_caixinha;
  if v_grupo is null or not public.eh_do_grupo(v_grupo) then raise exception 'Caixinha não encontrada.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor.'; end if;
  if p_valor > 100000000 then raise exception 'Valor alto demais para um depósito.'; end if;
  if p_meta_id is not null and not exists (select 1 from public.metas where espaco_id = p_meta_espaco and id = p_meta_id and grupo_id = v_grupo and not excluido) then
    raise exception 'Essa meta não está compartilhada com este grupo.';
  end if;
  if (select count(*) from public.caixinha_depositos where user_id = auth.uid() and criado_em > now() - interval '1 day') >= 30 then
    raise exception 'Muitos depósitos hoje. Tente amanhã.';
  end if;
  v_txid := 'IVP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  insert into public.caixinha_depositos (caixinha_id, user_id, valor, txid, meta_espaco, meta_id)
    values (p_caixinha, auth.uid(), p_valor, v_txid, p_meta_espaco, p_meta_id) returning id into v_id;
  return jsonb_build_object('id', v_id, 'txid', v_txid);
end $$;

-- Lança o aporte na meta (uma vez só) quando o depósito é dado como pago.
create or replace function public.caixinha_lancar_aporte(p_dep uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.caixinha_depositos; v_aporte uuid;
begin
  select * into d from public.caixinha_depositos where id = p_dep for update;
  if d.aporte_id is not null or d.meta_id is null then return; end if;
  if not exists (select 1 from public.metas where espaco_id = d.meta_espaco and id = d.meta_id and not excluido) then return; end if;
  insert into public.meta_aportes_grupo (espaco_id, meta_id, user_id, valor, data)
    values (d.meta_espaco, d.meta_id, d.user_id, d.valor, (coalesce(d.pago_em, now()) at time zone 'America/Sao_Paulo')::date)
    returning id into v_aporte;
  update public.caixinha_depositos set aporte_id = v_aporte where id = p_dep;
end $$;

-- "Já paguei": registra na hora (conta na meta); o extrato confirma depois.
create or replace function public.marcar_deposito_pago(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.caixinha_depositos set status = 'pago', pago_em = now()
    where id = p_id and user_id = auth.uid() and status = 'aguardando';
  if found then perform public.caixinha_lancar_aporte(p_id); end if;
end $$;

-- Dono confirma à mão (viu no app do banco antes da leitura automática).
create or replace function public.confirmar_deposito(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.caixinha_depositos d set status = 'confirmado', confirmado_em = now(), confirmado_por = 'manual', pago_em = coalesce(pago_em, now())
    from public.caixinhas c
    where d.id = p_id and c.id = d.caixinha_id and c.dono = auth.uid() and d.status in ('aguardando','pago');
  if found then perform public.caixinha_lancar_aporte(p_id); end if;
end $$;

-- Cancelar: quem criou (enquanto não confirmado) ou o dono. Desfaz o aporte na meta.
create or replace function public.cancelar_deposito(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_aporte uuid;
begin
  update public.caixinha_depositos d set status = 'cancelado'
    from public.caixinhas c
    where d.id = p_id and c.id = d.caixinha_id and d.status <> 'cancelado'
      and ((d.user_id = auth.uid() and d.status <> 'confirmado') or c.dono = auth.uid())
    returning d.aporte_id into v_aporte;
  if v_aporte is not null then
    delete from public.meta_aportes_grupo where id = v_aporte;
    update public.caixinha_depositos set aporte_id = null where id = p_id;
  end if;
end $$;

-- Usada pelo servidor (api/caixinha) ao achar o Pix no extrato.
create or replace function public.confirmar_deposito_banco(p_id uuid, p_transacao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.caixinha_depositos set status = 'confirmado', confirmado_em = now(), confirmado_por = 'banco', transacao_id = p_transacao, pago_em = coalesce(pago_em, now())
    where id = p_id and status in ('aguardando','pago');
  if found then perform public.caixinha_lancar_aporte(p_id); end if;
end $$;

revoke all on function public.minhas_caixinhas(), public.salvar_caixinha(uuid, text, text, text, text, text), public.novo_deposito(uuid, bigint, uuid, text),
  public.caixinha_lancar_aporte(uuid), public.marcar_deposito_pago(uuid), public.confirmar_deposito(uuid), public.cancelar_deposito(uuid),
  public.confirmar_deposito_banco(uuid, text) from public, anon, authenticated;
grant execute on function public.minhas_caixinhas(), public.salvar_caixinha(uuid, text, text, text, text, text), public.novo_deposito(uuid, bigint, uuid, text),
  public.marcar_deposito_pago(uuid), public.confirmar_deposito(uuid), public.cancelar_deposito(uuid) to authenticated;
grant execute on function public.confirmar_deposito_banco(uuid, text) to service_role;
