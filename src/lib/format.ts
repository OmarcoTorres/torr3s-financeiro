const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos → "R$ 1.234,56". */
export const dinheiro = (centavos: number) => BRL.format(centavos / 100);

/** Centavos → "1.234,56" (para campos de edição). */
export const numeroBR = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,56", "1234.56", "150" → centavos. Devolve null se não for número. */
export function lerValor(txt: string): number | null {
  let s = txt.replace(/[^\d,.-]/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "2026-11-02" → "02/11/2026". */
export const dataBR = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "—");
export const dataCurta = (iso?: string) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-11" → "novembro de 2026". */
export const mesExtenso = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
export const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)}/${mes.slice(2, 4)}`;
