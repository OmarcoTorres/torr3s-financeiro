import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { dinheiro } from "../lib/format";

/**
 * Comemoração de depósito: mensagem de carinho + corações subindo até a barra da meta,
 * que anda do progresso antigo até o novo. Disparada de qualquer tela com celebrarDeposito().
 */
export interface Celebracao { valor: number; mensagem: string; metaNome?: string; antes?: number; depois?: number; alvo?: number; cor?: string }

let atual: (Celebracao & { chave: number }) | null = null;
const ouvintes = new Set<() => void>();
export function celebrarDeposito(c: Celebracao) { atual = { ...c, chave: Date.now() }; ouvintes.forEach((f) => f()); }
function fechar() { atual = null; ouvintes.forEach((f) => f()); }

const MENSAGENS = [
  "Cada real guardado é um pedacinho do nosso sonho. Te amo! 💕",
  "Mais um passo juntinhos. Que orgulho de nós dois! ❤️",
  "O futuro da gente ficou {v} mais perto. 💞",
  "Guardar com você é o melhor investimento. 💗",
  "Juntos a gente chega lá. Um beijo e mais {v} no sonho! 😘",
  "Amor também é planejar o amanhã de mãos dadas. 💕",
  "Você + eu + {v} = sonho mais perto. ❤️",
];
/** Mensagem de carinho para o depósito ({v} vira o valor). */
export function mensagemDeCarinho(valor: number, metaNome?: string, falta?: number) {
  const base = MENSAGENS[Math.floor(Math.random() * MENSAGENS.length)].replace("{v}", dinheiro(valor));
  if (metaNome && falta !== undefined) return falta <= 0 ? `${base}\nA meta “${metaNome}” foi alcançada! 🎉` : `${base}\nFaltam ${dinheiro(falta)} para “${metaNome}”.`;
  return base;
}

export function CelebracaoCoracoes() {
  const c = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual);
  const [pct, setPct] = useState(0);
  const reduzir = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const temMeta = !!(c?.alvo && c.alvo > 0);
  const de = temMeta ? Math.min(100, ((c!.antes ?? 0) / c!.alvo!) * 100) : 0;
  const para = temMeta ? Math.min(100, ((c!.depois ?? 0) / c!.alvo!) * 100) : 0;

  // Corações com posição, atraso, tamanho e balanço sorteados (estáveis durante a comemoração).
  const coracoes = useMemo(() => Array.from({ length: reduzir ? 0 : 26 }, (_, i) => ({
    i, x: 8 + Math.random() * 84, atraso: Math.random() * 1.4, dur: 2.2 + Math.random() * 1.6, tam: 16 + Math.random() * 26, balanco: (Math.random() - 0.5) * 80,
  })), [c?.chave, reduzir]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!c) return;
    setPct(de);
    const t1 = window.setTimeout(() => setPct(para), reduzir ? 0 : 900);
    const t2 = window.setTimeout(fechar, reduzir ? 4500 : 6500);
    try { navigator.vibrate?.([30, 60, 30]); } catch { /* sem vibração */ }
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [c?.chave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return null;
  const cor = c.cor ?? "#d6457a";
  return (
    <div className="celebra" role="dialog" aria-live="polite" aria-label="Depósito registrado" onClick={fechar}>
      {coracoes.map((h) => (
        <Heart key={h.i} className="celebra-coracao" fill={cor} color={cor} size={h.tam} aria-hidden
          style={{ left: `${h.x}%`, animationDelay: `${h.atraso}s`, animationDuration: `${h.dur}s`, ["--balanco" as string]: `${h.balanco}px` }} />
      ))}
      <div className="celebra-cartao" onClick={(e) => e.stopPropagation()}>
        <Heart className="celebra-pulso" fill={cor} color={cor} size={44} aria-hidden />
        <b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.6rem" }}>+{dinheiro(c.valor)}</b>
        <p style={{ whiteSpace: "pre-line", textAlign: "center", margin: 0 }}>{c.mensagem}</p>
        {temMeta && (
          <div style={{ display: "grid", gap: 6, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: ".85rem" }}><span>{c.metaNome}</span><b className="num">{Math.round(pct)}%</b></div>
            <div className="trilho-prog celebra-trilho"><i style={{ width: `${pct}%`, background: cor, transition: reduzir ? "none" : "width 1.6s cubic-bezier(.2,.8,.2,1)" }} /></div>
            <span className="muted num" style={{ fontSize: ".8rem", textAlign: "center" }}>{dinheiro(c.depois ?? 0)} de {dinheiro(c.alvo!)}</span>
          </div>
        )}
        <button type="button" className="btn pri" onClick={fechar}>💕 Obrigado</button>
      </div>
    </div>
  );
}
