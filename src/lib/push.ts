import { supabase } from "./supabase";

/** Chave pública VAPID (a privada fica só na Vercel). */
const VAPID_PUBLICA = "BPEMsFUcc_DXcJHDWTA-vOw36WhGCqXellzwXvUnppvgI0SLjBEktMUID2NAwUdSxDMAecREzIUUn_InHzx6lmE";

export type Plataforma = "ios-safari" | "ios-outro" | "android" | "desktop";
export function plataforma(): Plataforma {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|WhatsApp|Line\//.test(ua) ? "ios-outro" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
export const instalado = () => matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const paraUint8 = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registro() {
  const r = await navigator.serviceWorker.ready;
  return r;
}

/** Inscrição deste aparelho, ou null. Nunca espera mais de 3 s (sem service worker ativo, "ready" não resolve). */
export async function assinaturaAtual() {
  if (!pushSuportado()) return null;
  const limite = new Promise<null>((ok) => setTimeout(() => ok(null), 3000));
  const reg = await Promise.race([navigator.serviceWorker.ready, limite]);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pede permissão (precisa ser chamado a partir de um toque) e registra este aparelho na conta. */
export async function ativarPush() {
  if (!pushSuportado()) throw new Error("Este navegador não recebe notificações.");
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error(permissao === "denied" ? "As notificações foram bloqueadas. Libere nos ajustes do aparelho para o Invest+." : "Permissão não concedida.");
  const reg = await registro();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraUint8(VAPID_PUBLICA) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  // Função do banco: reatribui o aparelho à conta atual mesmo que outra conta já o tenha usado.
  const { error } = await supabase.rpc("registrar_push", {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_aparelho: `${plataforma()} · ${navigator.userAgent.slice(0, 120)}`,
  });
  if (error) throw new Error(/registrar_push/.test(error.message) ? "Falta atualizar o banco (migração 0003)." : error.message);
  return sub;
}

export async function desativarPush() {
  const sub = await assinaturaAtual();
  if (!sub) return;
  await supabase.from("push_assinaturas").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Ao sair da conta: este aparelho para de receber os avisos dela. Nunca impede o logout. */
export async function desligarPushAoSair() {
  try {
    const sub = await assinaturaAtual();
    if (!sub) return;
    await supabase.from("push_assinaturas").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  } catch { /* sem internet: a inscrição é cancelada no navegador mesmo assim abaixo */
    try { await (await assinaturaAtual())?.unsubscribe(); } catch { /* ignora */ }
  }
}

export async function enviarTeste() {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api/push-teste", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j as { enviados: number };
}
