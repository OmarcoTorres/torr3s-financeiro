import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Atualização do app instalado. A versão nova baixa sozinha em segundo plano; o app avisa e
 * a pessoa escolhe a hora de aplicar. Se não aplicar, entra sozinha quando o app for para segundo plano
 * (assim nunca recarrega no meio de um lançamento).
 */
let pronta = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

const atualizar = registerSW({
  immediate: true,
  onNeedRefresh() { pronta = true; avisar(); },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const conferir = () => { if (navigator.onLine) void reg.update().catch(() => undefined); };
    setInterval(conferir, 30 * 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") conferir();
      else if (pronta) void atualizar(true);
    });
  },
});

export const aplicarVersaoNova = () => atualizar(true);
export const useVersaoNova = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => pronta);
