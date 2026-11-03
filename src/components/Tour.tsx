import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export interface PassoTour { alvo: string; titulo: string; texto: string }

/** Treinamento guiado: destaca um elemento por vez ([data-tour="..."]) com uma explicação curta. */
export function Tour({ passos, aoFechar }: { passos: PassoTour[]; aoFechar: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const passo = passos[i];

  const medir = useCallback(() => {
    const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${passo.alvo}"]`)].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed");
    const el = els[0];
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "center", behavior: "auto" });
    setRect(el.getBoundingClientRect());
  }, [passo]);

  useLayoutEffect(() => { medir(); }, [medir]);
  useEffect(() => {
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); if (e.key === "ArrowRight") proximo(); };
    document.addEventListener("keydown", esc);
    return () => { window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); document.removeEventListener("keydown", esc); };
  });

  const ultimo = i === passos.length - 1;
  function proximo() { if (ultimo) aoFechar(); else setI(i + 1); }

  // Caixa abaixo do alvo quando cabe; senão acima. Sem alvo visível, centralizada.
  const m = 8, w = Math.min(340, window.innerWidth - 32), alturaCaixa = 190;
  let top = window.innerHeight / 2 - alturaCaixa / 2, left = (window.innerWidth - w) / 2;
  if (rect) {
    top = rect.bottom + 14 + alturaCaixa < window.innerHeight ? rect.bottom + 14 : Math.max(16, rect.top - alturaCaixa - 14);
    left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 16);
  }

  return (
    <>
      <div className="tour-mascara" onClick={proximo} aria-hidden />
      {rect ? (
        <div className="tour-foco" style={{ top: rect.top - m, left: rect.left - m, width: rect.width + m * 2, height: rect.height + m * 2 }} />
      ) : (
        <div className="tour-foco" style={{ top: "50%", left: "50%", width: 0, height: 0 }} />
      )}
      <div className="tour-caixa" role="dialog" aria-modal="true" aria-labelledby="tour-t" style={{ top, left, width: w }}>
        <span className="conta">Passo {i + 1} de {passos.length}</span>
        <h3 id="tour-t">{passo.titulo}</h3>
        <p>{passo.texto}</p>
        <div className="rodape-tour">
          <button type="button" className="btn fantasma" onClick={aoFechar}>{ultimo ? "Fechar" : "Pular tour"}</button>
          <div className="linha-botoes">
            {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>Voltar</button>}
            <button type="button" className="btn pri" autoFocus onClick={proximo}>{ultimo ? "Concluir" : "Próximo"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
