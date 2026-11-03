-- Invest+ — compartilhar a conta (ou cartão) inteira com o grupo.
-- Rode DEPOIS da 0005: SQL Editor › New query › cole tudo › Run.
-- Conta compartilhada: o grupo vê todos os lançamentos dela, sem precisar marcar um por um.

alter table public.contas add column if not exists compartilhada boolean not null default false;

-- Ao ligar/desligar o compartilhamento da conta, "toca" os lançamentos dela para que
-- os aparelhos do grupo recebam (ou deixem de ver) esses lançamentos na próxima sincronização.
create or replace function public.contas_compartilhada_mudou()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.compartilhada is distinct from old.compartilhada then
    update public.lancamentos set atualizado_em = clock_timestamp()
      where espaco_id = new.espaco_id and (conta_id = new.id or conta_destino_id = new.id);
  end if;
  return new;
end $$;
drop trigger if exists contas_compartilhada_mudou on public.contas;
create trigger contas_compartilhada_mudou after update of compartilhada on public.contas
  for each row execute function public.contas_compartilhada_mudou();

-- Lançamentos compartilhados comigo: marcados um a um OU de conta compartilhada.
drop function if exists public.compartilhados_desde(timestamptz);
create function public.compartilhados_desde(p_desde timestamptz)
returns table (id text, autor_id uuid, autor_nome text, visivel boolean, tipo text, descricao text, valor bigint, data date,
               vencimento date, status text, categoria_nome text, categoria_cor text, conta_nome text, observacao text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  with donos as (
    select m.espaco_id, m.user_id from public.membros m
    where m.papel = 'dono' and public.conectados(auth.uid(), m.user_id) and m.user_id <> auth.uid()
  ), base as (
    select l.*, d.user_id as autor,
      (not l.excluido and (l.compartilhado or coalesce(ct.compartilhada, false) or coalesce(cd.compartilhada, false))) as ve,
      ct.nome as nome_conta
    from donos d
    join public.lancamentos l on l.espaco_id = d.espaco_id and l.atualizado_em > p_desde
    left join public.contas ct on ct.espaco_id = l.espaco_id and ct.id = l.conta_id
    left join public.contas cd on cd.espaco_id = l.espaco_id and cd.id = l.conta_destino_id
  )
  select b.id, b.autor, coalesce(p.nome, 'Alguém'), b.ve,
    case when b.ve then b.tipo end, case when b.ve then b.descricao end, case when b.ve then b.valor end,
    case when b.ve then b.data end, case when b.ve then b.vencimento end, case when b.ve then b.status end,
    case when b.ve then c.nome end, case when b.ve then c.cor end, case when b.ve then b.nome_conta end,
    case when b.ve then b.observacao end, b.atualizado_em
  from base b
  left join public.categorias c on c.espaco_id = b.espaco_id and c.id = b.categoria_id
  left join public.perfis p on p.user_id = b.autor
  order by b.atualizado_em
  limit 2000;
$$;
revoke all on function public.compartilhados_desde(timestamptz) from public, anon;
grant execute on function public.compartilhados_desde(timestamptz) to authenticated;
