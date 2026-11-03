-- Invest+ — lembrete diário (bom dia + ação do dia + frase).
-- Rode no Supabase: SQL Editor › New query › cole tudo › Run.
alter table public.notificacoes_prefs add column if not exists lembrete_diario boolean not null default true;
