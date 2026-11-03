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

export async function assinaturaAtual() {
  if (!pushSuportado()) return null;
  return (await registro()).pushManager.getSubscription();
}

/** Pede permissão (precisa ser chamado a partir de um toque) e registra este aparelho na conta. */
export async function ativarPush(userId: string) {
  if (!pushSuportado()) throw new Error("Este navegador não recebe notificações.");
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error(permissao === "denied" ? "As notificações foram bloqueadas. Libere nos ajustes do aparelho para o Invest+." : "Permissão não concedida.");
  const reg = await registro();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraUint8(VAPID_PUBLICA) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.from("push_assinaturas").upsert({
    endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: `${plataforma()} · ${navigator.userAgent.slice(0, 120)}`,
  });
  if (error) throw error;
  const { data: prefs } = await supabase.from("notificacoes_prefs").select("user_id").eq("user_id", userId).maybeSingle();
  if (!prefs) await supabase.from("notificacoes_prefs").insert({ user_id: userId });
  return sub;
}

export async function desativarPush() {
  const sub = await assinaturaAtual();
  if (!sub) return;
  await supabase.from("push_assinaturas").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

export async function enviarTeste() {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api/push-teste", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j as { enviados: number };
}
