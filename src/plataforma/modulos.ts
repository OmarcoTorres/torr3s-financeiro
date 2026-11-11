/** Plataforma: Invest+ (finanças), Vida+ (saúde e hábitos) e Kaya Life (registro pessoal, cifrado). */
export type Modulo = "invest" | "vida" | "kaya";
const CHAVE = "plataforma:modulo";
export const ROTA: Record<Modulo, string> = { invest: "/", vida: "/vida", kaya: "/kaya" };
export function moduloDaUrl(): Modulo | "seletor" | null {
  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/kaya" || p.startsWith("/kaya/")) return "kaya";
  if (p === "/vida" || p.startsWith("/vida/")) return "vida";
  if (p === "/modulos") return "seletor";
  if (p === "/invest") return "invest";
  return null;
}
export const moduloSalvo = () => { try { return localStorage.getItem(CHAVE) as Modulo | null; } catch { return null; } };
export const lembrarModulo = (m: Modulo) => { try { localStorage.setItem(CHAVE, m); } catch { /* ignora */ } };
export const irPara = (m: Modulo | "seletor") => { if (m !== "seletor") lembrarModulo(m); location.assign(m === "seletor" ? "/modulos" : ROTA[m]); };
