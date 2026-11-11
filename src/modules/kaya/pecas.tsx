import type { ReactNode } from "react";

type Ops = readonly (readonly [string, string])[];
export function Chips({ ops, valor, mudar, rotulo }: { ops: Ops; valor: string; mudar: (v: string) => void; rotulo: string }) {
  return <div className="kaya-chips" role="radiogroup" aria-label={rotulo}>{ops.map(([k, n]) => <button key={k} type="button" className="kaya-chip" role="radio" aria-checked={valor === k} aria-pressed={valor === k} onClick={() => mudar(valor === k ? "" : k)}>{n}</button>)}</div>;
}
export function ChipsMulti({ ops, valor, mudar, rotulo }: { ops: Ops; valor: string[]; mudar: (v: string[]) => void; rotulo: string }) {
  return <div className="kaya-chips" role="group" aria-label={rotulo}>{ops.map(([k, n]) => {
    const on = valor.includes(k);
    return <button key={k} type="button" className="kaya-chip" aria-pressed={on} onClick={() => mudar(on ? valor.filter((x) => x !== k) : [...valor, k])}>{n}</button>;
  })}</div>;
}
export function Escala({ rotulo, valor, mudar, min = 0, max = 10, legenda }: { rotulo: string; valor?: number; mudar: (v: number) => void; min?: number; max?: number; legenda?: [string, string] }) {
  return (
    <label className="kaya-escala">
      <span style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontWeight: 600 }}>{rotulo}</b><span className="muted">{valor ?? "—"}</span></span>
      <input type="range" min={min} max={max} value={valor ?? Math.round((min + max) / 2)} onChange={(e) => mudar(Number(e.target.value))} aria-valuetext={String(valor ?? "")} />
      {legenda && <span className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem" }}><span>{legenda[0]}</span><span>{legenda[1]}</span></span>}
    </label>
  );
}
export const HUMOR: [number, string][] = [[1, "Muito mal"], [2, "Mal"], [3, "Neutro"], [4, "Bem"], [5, "Muito bem"]];
export function Humor({ rotulo, valor, mudar }: { rotulo: string; valor?: number; mudar: (v: number) => void }) {
  return <div className="campo"><span>{rotulo}</span><div className="kaya-chips">{HUMOR.map(([n, t]) => <button key={n} type="button" className="kaya-chip" aria-pressed={valor === n} onClick={() => mudar(n)}>{t}</button>)}</div></div>;
}
export function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return <section className="card"><div className="cab"><h2>{titulo}</h2>{acao}</div>{children}</section>;
}
export const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function lerReais(t: string) { const n = Number(t.replace(/[^\d,]/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined; }
export const dia = (iso: string) => iso.slice(0, 10);
export const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");
