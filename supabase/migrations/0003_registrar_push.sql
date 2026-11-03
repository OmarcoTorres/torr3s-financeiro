-- Invest+ — registro de notificação por aparelho.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run.
-- Corrige: quando outra conta já tinha usado o mesmo aparelho, o RLS impedia a nova conta de ativar as notificações.
-- A função reatribui o aparelho a quem está logado agora (o navegador só entrega essa inscrição a quem está no aparelho).

create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Inscrição inválida.'; end if;
  insert into public.push_assinaturas (endpoint, user_id, p256dh, auth, aparelho, falhas)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_aparelho, 200), 0)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho, falhas = 0, criado_em = now();
  insert into public.notificacoes_prefs (user_id) values (auth.uid()) on conflict do nothing;
end $$;

revoke all on function public.registrar_push(text, text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;
