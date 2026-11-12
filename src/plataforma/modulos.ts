/** Plataforma: Invest+ (finanças) e Vida+ (saúde e hábitos, em breve). */
export type Modulo = "invest" | "vida";
const CHAVE = "plataforma:modulo";
export const ROTA: Record<Modulo, string> = { invest: "/", vida: "/vida" };
export function moduloDaUrl(): Modulo | "seletor" | "removido" | null {
  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/vida" || p.startsWith("/vida/")) return "vida";
  if (p === "/modulos") return "seletor";
  if (p === "/invest") return "invest";
  if (p === "/kaya" || p.startsWith("/kaya/")) return "removido"; // módulo descontinuado: volta para o Invest+
  return null;
}
export const moduloSalvo = (): Modulo | null => {
  try { const m = localStorage.getItem(CHAVE); return m === "invest" || m === "vida" ? m : null; } catch { return null; }
};
export const lembrarModulo = (m: Modulo) => { try { localStorage.setItem(CHAVE, m); } catch { /* ignora */ } };
export const irPara = (m: Modulo | "seletor") => { if (m !== "seletor") lembrarModulo(m); location.assign(m === "seletor" ? "/modulos" : ROTA[m]); };

/** Limpa do aparelho o que o módulo Kaya (descontinuado) tenha deixado: cofres locais cifrados e preferências. */
export async function limparRestosKaya() {
  try {
    if (localStorage.getItem(CHAVE) === "kaya") localStorage.removeItem(CHAVE);
    localStorage.removeItem("kaya:contato");
    const lista = await indexedDB.databases?.();
    for (const d of lista ?? []) if (d.name?.startsWith("kaya-")) indexedDB.deleteDatabase(d.name);
  } catch { /* navegador sem suporte: nada a limpar */ }
}
