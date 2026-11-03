import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Briefcase, Plus, Home, Users, Landmark, Wifi, Zap, Fuel, Utensils, Monitor, Tag, Car, ShoppingCart, Heart,
  GraduationCap, Plane, Wrench, Megaphone, PiggyBank, Receipt, ArrowLeftRight, X, ChevronLeft, ChevronRight, type LucideIcon,
} from "lucide-react";
import { db } from "../db";

export const ICONES: Record<string, LucideIcon> = {
  briefcase: Briefcase, plus: Plus, home: Home, users: Users, landmark: Landmark, wifi: Wifi, zap: Zap, fuel: Fuel,
  utensils: Utensils, monitor: Monitor, tag: Tag, car: Car, cart: ShoppingCart, heart: Heart, school: GraduationCap,
  plane: Plane, wrench: Wrench, megaphone: Megaphone, piggy: PiggyBank, receipt: Receipt,
};
export const CORES = ["#5b5bd6", "#8b7cf6", "#4cb3e6", "#3fbfa8", "#1f9d63", "#a3c93a", "#f2b84b", "#f08a4b", "#e5604d", "#ef6b8a", "#c06bd8", "#6b7090"];

export function IconeCategoria({ icone, cor, transferencia }: { icone?: string; cor?: string; transferencia?: boolean }) {
  const I = transferencia ? ArrowLeftRight : ICONES[icone ?? "tag"] ?? Tag;
  const c = transferencia ? "var(--muted)" : cor ?? "var(--muted)";
  return <span className="ic" style={{ background: `color-mix(in srgb, ${c} 15%, var(--surface))`, color: c }}><I aria-hidden /></span>;
}

/** Todos os dados do aparelho, ao vivo. */
export function useDados() {
  const lanc = useLiveQuery(() => db.lancamentos.toArray(), []);
  const cats = useLiveQuery(() => db.categorias.toArray(), []);
  const contas = useLiveQuery(() => db.contas.toArray(), []);
  const pessoas = useLiveQuery(() => db.pessoas.toArray(), []);
  const fech = useLiveQuery(() => db.fechamentos.toArray(), []);
  const metas = useLiveQuery(() => db.metas.toArray(), []);
  const pronto = !!(lanc && cats && contas && pessoas && fech && metas);
  return { pronto, lanc: lanc ?? [], cats: cats ?? [], contas: contas ?? [], pessoas: pessoas ?? [], fech: fech ?? [], metas: metas ?? [] };
}
export type DadosApp = ReturnType<typeof useDados>;

export function useConfig<T>(chave: string, padrao: T): [T, (v: T) => Promise<void>] {
  const reg = useLiveQuery(() => db.config.get(chave), [chave]);
  const valor = (reg?.valor as T | undefined) ?? padrao;
  const definir = useCallback(async (v: T) => { await db.config.put({ chave, valor: v }); }, [chave]);
  return [valor, definir];
}

export function Folha({ titulo, aberta, fechar, children, acoes }: { titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; acoes?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // fechar muda a cada renderização (função criada na hora); guardada em ref para o efeito
  // rodar só ao abrir. Antes ele rodava a cada letra e devolvia o foco para a janela.
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fecharRef.current();
    document.addEventListener("keydown", esc);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = anterior; };
  }, [aberta]);
  if (!aberta) return null;
  return (
    <div className="fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <div className="alca" aria-hidden />
        <div className="cab">
          <h2>{titulo}</h2>
          <div className="linha-botoes">{acoes}<button className="btn icone fantasma" onClick={fechar} aria-label="Fechar"><X /></button></div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="campo"><span>{rotulo}</span>{children}</label>;
}

export function Seg<T extends string>({ valor, opcoes, mudar, rotulo }: { valor: T; opcoes: [T, string][]; mudar: (v: T) => void; rotulo: string }) {
  return (
    <div className="seg" role="group" aria-label={rotulo}>
      {opcoes.map(([v, nome]) => (
        <button key={v} type="button" className={`t-${v}`} aria-pressed={valor === v} onClick={() => mudar(v)}>{nome}</button>
      ))}
    </div>
  );
}

const AvisoCtx = createContext<(t: string) => void>(() => undefined);
export const useAviso = () => useContext(AvisoCtx);
export function AvisoProvider({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState("");
  const timer = useRef<number>();
  const mostrar = useCallback((t: string) => {
    setTexto(t); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTexto(""), 2600);
  }, []);
  return <AvisoCtx.Provider value={mostrar}>{children}{texto && <div className="toast" role="status">{texto}</div>}</AvisoCtx.Provider>;
}

/** Botão que pede um segundo toque para confirmar (o app não usa confirm() do navegador). */
export function BotaoConfirmar({ children, confirmar, onConfirm, className = "btn perigo" }: { children: ReactNode; confirmar: string; onConfirm: () => void; className?: string }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 4000); return () => clearTimeout(t); }, [armado]);
  return <button type="button" className={className} onClick={() => (armado ? (setArmado(false), onConfirm()) : setArmado(true))}>{armado ? confirmar : children}</button>;
}

/** Marca um item da lista "Primeiros passos" como concluído. */
export async function marcarProgresso(chave: "contas" | "relatorio" | "backup") {
  const atual = ((await db.config.get("progresso"))?.valor ?? {}) as Record<string, boolean>;
  if (!atual[chave]) await db.config.put({ chave: "progresso", valor: { ...atual, [chave]: true } });
}

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Seletor de mês com setas: mais fácil no celular do que o campo nativo de mês. */
export function SeletorMes({ valor, mudar, rotulo = "Mês" }: { valor: string; mudar: (m: string) => void; rotulo?: string }) {
  const passo = (n: number) => {
    const [a, m] = valor.split("-").map(Number);
    const d = new Date(a, m - 1 + n, 1);
    mudar(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const [a, m] = valor.split("-").map(Number);
  return (
    <div className="seletor-mes" role="group" aria-label={rotulo}>
      <button type="button" onClick={() => passo(-1)} aria-label="Mês anterior"><ChevronLeft /></button>
      <span><b>{NOMES_MES[m - 1]}</b> {a}</span>
      <button type="button" onClick={() => passo(1)} aria-label="Próximo mês"><ChevronRight /></button>
    </div>
  );
}

