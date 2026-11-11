/** Plataforma: Invest+ (finanças), Vida+ (saúde e hábitos) e Kaya Life (registro pessoal, cifrado). */
export type Modulo = "invest" | "vida" | "kaya";
const CHAVE = "plataforma:modulo";
/** kayalife.vercel.app: a raiz abre o Kaya Life (o Invest+ fica em /invest). */
export const hostKaya = () => /^kayalife\./.test(location.hostname);
export const ROTA: Record<Modulo, string> = { get invest() { return hostKaya() ? "/invest" : "/"; }, vida: "/vida", kaya: "/kaya" } as Record<Modulo, string>;
export function moduloDaUrl(): Modulo | "seletor" | null {
  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/kaya" || p.startsWith("/kaya/")) return "kaya";
  if (p === "/vida" || p.startsWith("/vida/")) return "vida";
  if (p === "/modulos") return "seletor";
  if (p === "/invest") return "invest";
  if (hostKaya()) return "kaya";
  return null;
}
export const moduloSalvo = () => { try { return localStorage.getItem(CHAVE) as Modulo | null; } catch { return null; } };
export const lembrarModulo = (m: Modulo) => { try { localStorage.setItem(CHAVE, m); } catch { /* ignora */ } };
export const irPara = (m: Modulo | "seletor") => { if (m !== "seletor") lembrarModulo(m); location.assign(m === "seletor" ? "/modulos" : ROTA[m]); };
