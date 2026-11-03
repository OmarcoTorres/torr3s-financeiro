import { createClient } from "@supabase/supabase-js";

/**
 * Projeto Supabase do Invest+. A chave "publishable/anon" é pública por definição (vai para o navegador);
 * quem protege os dados são as regras de RLS do banco. Pode ser sobrescrita por variáveis da Vercel.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wvbpwbhzyhfqrymftwqj.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigurado = !!SUPABASE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY || "chave-ausente", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "investmais-sessao" },
});

/** Mensagens do Supabase Auth em português. */
export function erroAuth(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar: abra o link que enviamos.";
  if (/User already registered/i.test(m)) return "Já existe uma conta com este e-mail. Use Entrar ou recupere a senha.";
  if (/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/Unable to validate email|invalid format/i.test(m)) return "Confira o e-mail digitado.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique a internet.";
  return m;
}
