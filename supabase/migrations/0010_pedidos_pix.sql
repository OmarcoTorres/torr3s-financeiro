-- Invest+ — pedido de Pix entre pessoas do grupo (ex.: Rita pede, Marco faz o Pix pela conta dele).
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run. Pode rodar mais de uma vez.
--
-- O app NÃO movimenta dinheiro: registra o pedido, avisa por push quem vai pagar, gera o Pix copia e cola
-- para o destino e avisa de volta quem pediu quando o Pix foi feito (ou recusado).

create table if not exists public.pedidos_pix (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  solicitante uuid not null default auth.uid() references auth.users(id) on delete cascade,
  responsavel uuid not null references auth.users(id) on delete cascade,
  valor bigint not null check (valor > 0 and valor <= 100000000),
  chave text not null check (length(trim(chave)) between 3 and 77),
  favorecido text not null check (length(trim(favorecido)) between 1 and 60),
  motivo text check (length(motivo) <= 140),
  status text not null default 'pendente' check (status in ('pendente','feito','recusado','cancelado')),
  resposta text check (length(resposta) <= 140),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  notificado_em timestamptz,          -- push do pedido para quem paga
  notificado_resposta_em timestamptz  -- push da resposta para quem pediu
);
create index if not exists pedidos_pix_grupo_idx on public.pedidos_pix(grupo_id, criado_em desc);
alter table public.pedidos_pix enable row level security;
-- Sem policies: tudo pelas funções abaixo (e pelo servidor, que manda os pushes).

create or replace function public.pedir_pix(p_grupo uuid, p_responsavel uuid, p_valor bigint, p_chave text, p_favorecido text, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  if not public.eh_do_grupo(p_grupo) then raise exception 'Você não faz parte deste grupo.'; end if;
  if p_responsavel = auth.uid() then raise exception 'Escolha outra pessoa do grupo para fazer o Pix.'; end if;
  if not public.eh_do_grupo(p_grupo, p_responsavel) then raise exception 'Essa pessoa não está no grupo.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor.'; end if;
  if (select count(*) from public.pedidos_pix where solicitante = auth.uid() and criado_em > now() - interval '1 day') >= 30 then
    raise exception 'Muitos pedidos hoje. Tente amanhã.';
  end if;
  insert into public.pedidos_pix (grupo_id, solicitante, responsavel, valor, chave, favorecido, motivo)
    values (p_grupo, auth.uid(), p_responsavel, p_valor, trim(p_chave), trim(p_favorecido), nullif(trim(p_motivo), ''))
    returning id into v_id;
  return v_id;
end $$;

-- Pedidos dos meus grupos (que fiz ou que são para mim), com os nomes.
create or replace function public.pedidos_pix_meus()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'grupo_id', p.grupo_id, 'solicitante', p.solicitante, 'solicitante_nome', coalesce(ps.nome, 'Alguém'),
    'responsavel', p.responsavel, 'responsavel_nome', coalesce(pr.nome, 'Alguém'),
    'valor', p.valor, 'chave', p.chave, 'favorecido', p.favorecido, 'motivo', p.motivo, 'status', p.status, 'resposta', p.resposta,
    'criado_em', p.criado_em, 'respondido_em', p.respondido_em,
    'para_mim', p.responsavel = auth.uid(), 'meu', p.solicitante = auth.uid()
  ) order by p.criado_em desc), '[]'::jsonb)
  from (select * from public.pedidos_pix
        where (solicitante = auth.uid() or responsavel = auth.uid()) and public.eh_do_grupo(grupo_id)
        order by criado_em desc limit 60) p
  left join public.perfis ps on ps.user_id = p.solicitante
  left join public.perfis pr on pr.user_id = p.responsavel;
$$;

-- Quem paga responde: 'feito' ou 'recusado' (com um recado opcional).
create or replace function public.responder_pedido_pix(p_id uuid, p_status text, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('feito','recusado') then raise exception 'Resposta inválida.'; end if;
  update public.pedidos_pix set status = p_status, resposta = nullif(trim(p_resposta), ''), respondido_em = now()
    where id = p_id and responsavel = auth.uid() and status = 'pendente';
  if not found then raise exception 'Esse pedido não está mais pendente.'; end if;
end $$;

-- Quem pediu pode desistir enquanto está pendente.
create or replace function public.cancelar_pedido_pix(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.pedidos_pix set status = 'cancelado', respondido_em = now()
    where id = p_id and solicitante = auth.uid() and status = 'pendente';
$$;

revoke all on function public.pedir_pix(uuid, uuid, bigint, text, text, text), public.pedidos_pix_meus(),
  public.responder_pedido_pix(uuid, text, text), public.cancelar_pedido_pix(uuid) from public, anon;
grant execute on function public.pedir_pix(uuid, uuid, bigint, text, text, text), public.pedidos_pix_meus(),
  public.responder_pedido_pix(uuid, text, text), public.cancelar_pedido_pix(uuid) to authenticated;
