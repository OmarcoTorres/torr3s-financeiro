import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { hoje, somarDias } from "../lib/calc";
import { SeletorMes } from "./ui";

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

/** "18750" → "187,50"; só dígitos, como teclado de banco (os dois últimos são os centavos). */
export function mascaraValor(txt: string) {
  const dig = txt.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  if (!dig) return "";
  const c = Number(dig);
  return (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valor em reais: aceita só números e formata enquanto digita. */
export function InputValor({ value, onChange, grande, ...resto }: Base & { value: string; onChange: (v: string) => void; grande?: boolean }) {
  return (
    <div className={`campo-valor ${grande ? "grande" : ""}`}>
      <span aria-hidden>R$</span>
      <input {...resto} type="text" inputMode="numeric" autoComplete="off" value={value} placeholder={resto.placeholder ?? "0,00"}
        onChange={(e) => onChange(mascaraValor(e.target.value))} />
    </div>
  );
}

/** Só dígitos, com tamanho máximo (final do cartão, dia, idade, parcelas). */
export function InputDigitos({ value, onChange, max, ...resto }: Base & { value: string; onChange: (v: string) => void; max: number }) {
  return <input {...resto} type="text" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, max))} />;
}

/** Porcentagem de 0 a 100 com até 2 casas. */
export function InputPorcentagem({ value, onChange, ...resto }: Base & { value: string; onChange: (v: string) => void }) {
  return (
    <input {...resto} type="text" inputMode="decimal" autoComplete="off" value={value}
      onChange={(e) => {
        let v = e.target.value.replace(/[^\d,]/g, "").replace(/(,.*),/g, "$1");
        const [i, d] = v.split(",");
        v = d !== undefined ? `${i.slice(0, 3)},${d.slice(0, 2)}` : i.slice(0, 3);
        if (Number(v.replace(",", ".")) > 100) v = "100";
        onChange(v);
      }} />
  );
}

/** Telefone brasileiro: (11) 99999-0000. */
export function InputTelefone({ value, onChange, ...resto }: Base & { value: string; onChange: (v: string) => void }) {
  const fmt = (t: string) => {
    const d = t.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  return <input {...resto} type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => onChange(fmt(e.target.value))} />;
}

/** Nome de pessoa: letras, espaços, ponto, hífen e apóstrofo (sem números). */
export function InputNome({ value, onChange, ...resto }: Base & { value: string; onChange: (v: string) => void }) {
  return <input {...resto} type="text" autoComplete="name" autoCapitalize="words" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\p{L}\s.'-]/gu, ""))} />;
}

// ---------- Datas ----------
const paraBR = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "");
function paraISO(br: string) {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m.map(Number) as unknown as [number, number, number, number];
  const dt = new Date(a, mes - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== d || a < 1990 || a > 2100) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function mascaraData(t: string) {
  const d = t.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export type AtalhoData = "hoje" | "ontem" | "amanha" | "+7" | "+30" | "limpar";
const ROTULO_ATALHO: Record<AtalhoData, string> = { hoje: "Hoje", ontem: "Ontem", amanha: "Amanhã", "+7": "+7 dias", "+30": "+30 dias", limpar: "Sem data" };
const valorAtalho = (a: AtalhoData, base?: string): string => {
  const h = hoje();
  switch (a) {
    case "hoje": return h;
    case "ontem": return somarDias(h, -1);
    case "amanha": return somarDias(h, 1);
    case "+7": return somarDias(base || h, 7);
    case "+30": return somarDias(base || h, 30);
    default: return "";
  }
};

/**
 * Data: digite dd/mm/aaaa (as barras entram sozinhas), use um atalho ou abra o calendário.
 * Devolve AAAA-MM-DD, ou "" quando vazio.
 */
export function CampoData({ id, valor, mudar, atalhos = [], base, obrigatoria }: {
  id: string; valor: string; mudar: (iso: string) => void; atalhos?: AtalhoData[]; base?: string; obrigatoria?: boolean;
}) {
  const [txt, setTxt] = useState(paraBR(valor));
  const [invalida, setInvalida] = useState(false);
  const nativo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (paraISO(txt) !== valor) setTxt(paraBR(valor)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [valor]);

  function digitar(t: string) {
    const m = mascaraData(t);
    setTxt(m);
    if (!m) { setInvalida(false); if (!obrigatoria) mudar(""); return; }
    if (m.length === 10) { const iso = paraISO(m); setInvalida(!iso); if (iso) mudar(iso); }
    else setInvalida(false);
  }
  function abrirCalendario() {
    const el = nativo.current;
    if (!el) return;
    try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { el.focus(); el.click(); }
  }
  const sel = (a: AtalhoData) => valorAtalho(a, base) === valor && !(a === "limpar" && valor);

  return (
    <div className="campo-data-wrap">
      <div className={`campo-data ${invalida ? "invalida" : ""}`}>
        <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" value={txt} onChange={(e) => digitar(e.target.value)}
          onBlur={() => { if (txt && !paraISO(txt)) setInvalida(true); }} aria-invalid={invalida} />
        {/* O campo de data nativo fica invisível por cima do ícone: tocar nele abre o calendário do próprio aparelho. */}
        <span className="icone-cal" aria-hidden><CalendarDays size={19} /></span>
        <input ref={nativo} type="date" className="data-nativa" aria-label="Escolher no calendário" value={valor} onClick={abrirCalendario}
          onChange={(e) => { setInvalida(false); mudar(e.target.value); setTxt(paraBR(e.target.value)); }} />
      </div>
      {invalida && <small className="neg">Data inválida. Use dd/mm/aaaa.</small>}
      {atalhos.length > 0 && (
        <div className="atalhos-data">
          {atalhos.map((a) => (
            <button key={a} type="button" aria-pressed={sel(a)} onClick={() => { const v = valorAtalho(a, base); setInvalida(false); setTxt(paraBR(v)); mudar(v); }}>{ROTULO_ATALHO[a]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mês opcional (prazo de meta): seletor com setas e a opção "sem prazo". */
export function CampoMesOpcional({ valor, mudar }: { valor: string; mudar: (m: string) => void }) {
  const padrao = (() => { const [a, m] = hoje().split("-").map(Number); const d = new Date(a, m + 5, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  return (
    <div className="campo-data-wrap">
      {valor ? <SeletorMes valor={valor} mudar={mudar} rotulo="Mês do prazo" /> : <div className="seletor-mes vazio-mes"><span className="muted">Sem prazo definido</span></div>}
      <div className="atalhos-data">
        <button type="button" aria-pressed={!valor} onClick={() => mudar("")}>Sem prazo</button>
        <button type="button" aria-pressed={!!valor} onClick={() => !valor && mudar(padrao)}>Definir mês</button>
      </div>
    </div>
  );
}
