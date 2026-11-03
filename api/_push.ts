import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./_lib.js";

/** Cliente com a chave de serviço: só existe no servidor e ignora o RLS (lê os dados para montar os lembretes). */
export function supabaseAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY nas variáveis da Vercel.");
  return createClient(SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

let configurado = false;
function configurar() {
  if (configurado) return;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("Faltam VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis da Vercel.");
  webpush.setVapidDetails("mailto:contato@torr3s.com.br", pub, priv);
  configurado = true;
}

export interface Aviso { title: string; body: string; url?: string; tag?: string }

/** Envia para todos os aparelhos do usuário; remove inscrições que o navegador já cancelou. */
export async function enviarParaUsuario(admin: ReturnType<typeof supabaseAdmin>, userId: string, avisos: Aviso[]) {
  configurar();
  const { data: assinaturas, error } = await admin.from("push_assinaturas").select("*").eq("user_id", userId);
  if (error) throw error;
  let enviados = 0;
  for (const a of assinaturas ?? []) {
    let ok = 0, removida = false;
    for (const aviso of avisos) {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(aviso), { TTL: 60 * 60 * 12, urgency: "normal" });
        ok++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) { await admin.from("push_assinaturas").delete().eq("endpoint", a.endpoint); removida = true; break; }
        console.error("push", status, (e as Error).message);
      }
    }
    enviados += ok;
    if (!removida) await admin.from("push_assinaturas").update(ok ? { ultimo_envio: new Date().toISOString(), falhas: 0 } : { falhas: (a.falhas ?? 0) + 1 }).eq("endpoint", a.endpoint);
  }
  return enviados;
}
