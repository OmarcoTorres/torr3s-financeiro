-- Remove o módulo Kaya (descontinuado em 2026-11-12). APAGA DE VEZ os dados cifrados do Kaya.
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run. Pode rodar mais de uma vez.
-- modulos_conta continua (Invest+ e Vida+).
delete from public.modulos_conta where modulo = 'kaya';
alter table public.modulos_conta drop constraint if exists modulos_conta_modulo_check;
alter table public.modulos_conta add constraint modulos_conta_modulo_check check (modulo in ('invest', 'vida'));
drop function if exists public.kaya_excluir_tudo();
drop table if exists public.kaya_itens;
drop table if exists public.kaya_chaves;
drop function if exists public.kaya_tocar();
