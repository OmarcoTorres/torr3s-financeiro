import { useState } from "react";
import { Cloud, Cookie, Droplets, Flame, Hand, Leaf, Search, Trash2 } from "lucide-react";
import { BotaoConfirmar, Folha, useAviso } from "../../components/ui";
import { excluir, salvar, useKaya } from "./dados";
import { HUMOR, Humor, diaLocal, reais } from "./pecas";
import { de } from "./Telas";
import { OP, rotulo } from "./textos";
import type { ComId, Registro } from "./tipos";

const ICONE: Record<string, typeof Leaf> = { fumada: Flame, vaporizada: Cloud, comestivel: Cookie, oleo: Droplets, topica: Hand };
const COR: Record<string, string> = { fumada: "#C8774F", vaporizada: "#5E8C7A", comestivel: "#B08B4F", oleo: "#6F7F4E", topica: "#8C7A6B" };
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const humorTxt = (n?: number) => HUMOR.find(([v]) => v === n)?.[1].toLowerCase();

export function ItemRegistro({ r, abrir, comData }: { r: ComId<Registro>; abrir?: (r: ComId<Registro>) => void; comData?: boolean }) {
  const I = ICONE[r.forma] ?? Leaf;
  const c = COR[r.forma] ?? "var(--accent)";
  const d = r.humorDepois ? r.humorDepois - r.humorAntes : null;
  return (
    <button type="button" className="item" onClick={() => abrir?.(r)} disabled={!abrir} style={{ cursor: abrir ? "pointer" : "default", color: "inherit" }}>
      <span className="ic" style={{ background: `color-mix(in srgb, ${c} 16%, var(--surface))`, color: c }}><I aria-hidden /></span>
      <div>
        <div className="tt">{rotulo(OP.formas, r.forma) || "Registro"} · {r.quantidade}</div>
        <div className="meta">
          <span>{comData ? `${new Date(r.quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")} ` : ""}{hora(r.quando)}</span>
          <span className={`pill ${r.escolha === "intencional" ? "pago" : "pendente"}`}>{r.escolha === "intencional" ? "com intenção" : "automático"}</span>
          {r.contexto.slice(0, 2).map((x) => <span key={x}>{rotulo(OP.contexto, x)}</span>)}
        </div>
      </div>
      <div className="val">
        {d !== null ? <span className={d > 0 ? "pos" : d < 0 ? "neg" : "muted"} title="Humor antes → depois">{r.humorAntes}→{r.humorDepois}</span> : <span className="muted" style={{ fontSize: ".75rem" }}>depois?</span>}
        {r.custo ? <span className="muted" style={{ fontSize: ".78rem" }}>{reais(r.custo)}</span> : null}
      </div>
    </button>
  );
}

export function Registros({ novo }: { novo: () => void }) {
  const { itens } = useKaya();
  const aviso = useAviso();
  const [filtro, setFiltro] = useState<"" | "intencional" | "automatico">("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<ComId<Registro> | null>(null);
  const regs = de(itens, "registro").filter((r) => (!filtro || r.escolha === filtro) && (!busca || JSON.stringify(r).toLowerCase().includes(busca.toLowerCase()))).sort((a, b) => b.quando.localeCompare(a.quando));
  const dias = [...new Set(regs.map((r) => diaLocal(r.quando)))];
  return (
    <>
      <div className="filtros" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label className="kaya-busca" style={{ flex: "1 1 200px" }}><Search size={18} aria-hidden /><input placeholder="Buscar em contexto, notas…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" /></label>
        <div className="seg" role="group" aria-label="Filtro">
          {([["", "Todos"], ["intencional", "Com intenção"], ["automatico", "Automático"]] as const).map(([v, n]) => <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{n}</button>)}
        </div>
      </div>
      {dias.length ? dias.map((d) => (
        <section key={d} className="card">
          <div className="cab"><h2>{((t) => t.charAt(0).toUpperCase() + t.slice(1))(new Date(`${d}T12:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</h2><span className="chip">{regs.filter((r) => diaLocal(r.quando) === d).length}</span></div>
          <div className="lista">{regs.filter((r) => diaLocal(r.quando) === d).map((r) => <ItemRegistro key={r.id} r={r} abrir={setAberto} />)}</div>
        </section>
      )) : <section className="card"><div className="vazio"><Leaf /><div>{busca || filtro ? "Nada encontrado com esse filtro." : "Seus registros aparecem aqui, por dia."}</div>{!busca && !filtro && <button type="button" className="btn pri" onClick={novo}>Registrar</button>}</div></section>}

      <Folha titulo="Registro" aberta={!!aberto} fechar={() => setAberto(null)}>
        {aberto && <Detalhe r={aberto} fechar={() => setAberto(null)} aviso={aviso} />}
      </Folha>
    </>
  );
}

function Detalhe({ r, fechar, aviso }: { r: ComId<Registro>; fechar: () => void; aviso: (t: string) => void }) {
  const [depois, setDepois] = useState(r.humorDepois ?? 0);
  const [nota, setNota] = useState(r.nota ?? "");
  const { id, ...dados } = r;
  return (
    <>
      <div className="duas">
        <div className="kpi"><span className="k">Quando</span><span className="v" style={{ fontSize: "1rem" }}>{new Date(r.quando).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
        <div className="kpi"><span className="k">Forma</span><span className="v" style={{ fontSize: "1rem" }}>{rotulo(OP.formas, r.forma) || "—"} · {r.quantidade}</span></div>
      </div>
      {r.checkin && (r.checkin.porque || r.checkin.como || r.checkin.espera) && (
        <div className="aviso dica"><div><b>Check-in</b>{r.checkin.porque && <div>Por quê: {r.checkin.porque}</div>}{r.checkin.como && <div>Como estava: {r.checkin.como}</div>}{r.checkin.espera && <div>Esperava: {r.checkin.espera}</div>}{r.checkin.esperou10 && <div>Esperou os 10 minutos.</div>}</div></div>
      )}
      <span className="muted">Humor antes: {humorTxt(r.humorAntes)}</span>
      <Humor rotulo="Como você ficou depois?" valor={depois} mudar={setDepois} />
      <label className="campo"><span>Nota</span><textarea rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      <div className="linha-botoes">
        <button type="button" className="btn pri" onClick={() => void salvar<Registro>({ ...dados, humorDepois: depois || undefined, nota: nota.trim() || undefined }, id).then(() => { aviso("Registro atualizado."); fechar(); })}>Salvar</button>
        <BotaoConfirmar confirmar="Toque de novo para apagar" onConfirm={() => void excluir(id).then(() => { aviso("Registro apagado."); fechar(); })}><Trash2 />Apagar</BotaoConfirmar>
      </div>
    </>
  );
}
