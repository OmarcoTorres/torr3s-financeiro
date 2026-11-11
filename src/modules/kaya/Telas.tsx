import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Feather, Pause, PenLine, Wind } from "lucide-react";
import { useAviso } from "../../components/ui";
import { ID_PERFIL, salvar, useKaya } from "./dados";
import { Chips, ChipsMulti, Escala, Humor, Secao, diaLocal, hojeIso, lerReais, quando, reais } from "./pecas";
import { DISCLAIMER, OP, PROMPTS_DIARIO, rotulo, termo } from "./textos";
import type { ComId, Diario, Gasto, Item, Pausa, Perfil, Registro, Regra, Sintoma } from "./tipos";

export const de = <T extends Item["tipo"]>(itens: ComId<Item>[], tipo: T) => itens.filter((x) => x.tipo === tipo) as ComId<Extract<Item, { tipo: T }>>[];
export const perfilDe = (itens: ComId<Item>[]) => itens.find((x) => x.tipo === "perfil") as ComId<Perfil> | undefined;
const mesAtual = () => hojeIso().slice(0, 7);
export function gastoDoMes(itens: ComId<Item>[], mes = mesAtual()) {
  return de(itens, "registro").filter((r) => diaLocal(r.quando).startsWith(mes)).reduce((a, r) => a + (r.custo ?? 0), 0)
    + de(itens, "gasto").filter((g) => diaLocal(g.quando).startsWith(mes)).reduce((a, g) => a + g.valor, 0);
}

/** Números da semana (últimos 7 dias) — comparação sempre com a própria pessoa. */
export function semana(itens: ComId<Item>[]) {
  const regs = de(itens, "registro");
  const hoje = new Date(); const dias: string[] = [];
  for (let i = 6; i >= 0; i--) { const x = new Date(hoje); x.setDate(x.getDate() - i); dias.push(diaLocal(x.toISOString())); }
  const porDia = dias.map((dd) => regs.filter((r) => diaLocal(r.quando) === dd).length);
  const naSemana = regs.filter((r) => dias.includes(diaLocal(r.quando)));
  const anterior = regs.filter((r) => { const t = (Date.now() - new Date(r.quando).getTime()) / 86_400_000; return t >= 7 && t < 14; }).length;
  const total = porDia.reduce((a, b) => a + b, 0);
  const intencionais = naSemana.filter((r) => r.escolha === "intencional").length;
  const diasSem = porDia.filter((n) => n === 0).length;
  const leitura = total === 0 ? (regs.length ? "Semana sem registros." : "Comece registrando para ver suas tendências.")
    : diasSem >= 3 && intencionais >= total / 2 ? "Semana com espaço e intenção." : diasSem >= 2 ? "Há pausas na sua semana." : "Semana intensa. Observar já é um passo.";
  return { dias, porDia, total, anterior, intencionais, diasSem, leitura };
}

// ---------- Registrar: check-in (opcional) → convite de 10 min → registro ----------
export function Registrar({ fechar, pausar }: { fechar: () => void; pausar: () => void }) {
  const { itens } = useKaya();
  const aviso = useAviso();
  const p = perfilDe(itens)!;
  const [etapa, setEtapa] = useState<"checkin" | "espera" | "registro">("checkin");
  const [ck, setCk] = useState({ porque: "", como: "", espera: "" });
  const [esperou, setEsperou] = useState(false);
  const [r, setR] = useState({ forma: p.formas[0] ?? "", quantidade: "" as Registro["quantidade"] | "", contexto: [] as string[], humorAntes: 0, custo: "", escolha: "" as Registro["escolha"] | "", nota: "" });
  const temCk = !!(ck.porque || ck.como || ck.espera);
  const passo = etapa === "checkin" ? 1 : etapa === "espera" ? 2 : 3;
  async function gravar() {
    await salvar<Registro>({
      tipo: "registro", quando: new Date().toISOString(), forma: r.forma, quantidade: (r.quantidade || "moderado") as Registro["quantidade"], contexto: r.contexto,
      humorAntes: r.humorAntes || 3, custo: lerReais(r.custo), escolha: (r.escolha || (temCk ? "intencional" : "automatico")) as Registro["escolha"],
      checkin: temCk ? { ...ck, esperou10: esperou } : undefined, nota: r.nota.trim() || undefined,
    });
    aviso("Registrado. Depois, conte como você ficou em Registros."); fechar();
  }
  return (
    <>
      <div className="kaya-etapas" aria-label={`Etapa ${passo} de 3`}>{["Intenção", "Pausa", "Registro"].map((n, i) => <span key={n} className={i + 1 <= passo ? "on" : ""}>{n}</span>)}</div>
      {etapa === "checkin" && (
        <>
          <p className="muted">Três perguntas rápidas antes de registrar. Todas opcionais.</p>
          <label className="campo"><span>Por que agora?</span><input value={ck.porque} maxLength={120} onChange={(e) => setCk({ ...ck, porque: e.target.value })} placeholder="Ex.: dia pesado, encontro com amigos" /></label>
          <label className="campo"><span>Como você está?</span><input value={ck.como} maxLength={120} onChange={(e) => setCk({ ...ck, como: e.target.value })} placeholder="Ex.: cansado, ansioso, tranquilo" /></label>
          <label className="campo"><span>O que você espera sentir?</span><input value={ck.espera} maxLength={120} onChange={(e) => setCk({ ...ck, espera: e.target.value })} placeholder="Ex.: relaxar, dormir melhor" /></label>
          <button type="button" className="btn pri grande" onClick={() => setEtapa("espera")}>Continuar</button><button type="button" className="btn fantasma" onClick={() => setEtapa("registro")}>Pular para o registro</button>
        </>
      )}
      {etapa === "espera" && <Espera pausar={pausar} aoTerminar={(e) => { setEsperou(e); setEtapa("registro"); }} />}
      {etapa === "registro" && (
        <>
          <div className="campo"><span>Forma</span><Chips rotulo="Forma" ops={OP.formas} valor={r.forma} mudar={(v) => setR({ ...r, forma: v })} /></div>
          <div className="campo"><span>Quantidade percebida</span><div className="seg" role="group" aria-label="Quantidade">{OP.quantidade.map(([k, n]) => <button key={k} type="button" aria-pressed={r.quantidade === k} onClick={() => setR({ ...r, quantidade: k as Registro["quantidade"] })}>{n}</button>)}</div></div>
          <div className="campo"><span>Contexto</span><ChipsMulti rotulo="Contexto" ops={OP.contexto} valor={r.contexto} mudar={(v) => setR({ ...r, contexto: v })} /></div>
          <Humor rotulo="Humor agora" valor={r.humorAntes} mudar={(v) => setR({ ...r, humorAntes: v })} />
          <div className="campo"><span>Foi uma escolha…</span><div className="seg" role="group" aria-label="Escolha">{([["intencional", "Com intenção"], ["automatico", "No automático"]] as const).map(([k, n]) => <button key={k} type="button" aria-pressed={(r.escolha || (temCk ? "intencional" : "")) === k} onClick={() => setR({ ...r, escolha: k })}>{n}</button>)}</div></div>
          <div className="duas">
            <label className="campo"><span>Custo (opcional)</span><input inputMode="decimal" value={r.custo} placeholder="R$ 0,00" onChange={(e) => setR({ ...r, custo: e.target.value })} /></label>
            <label className="campo"><span>Nota (opcional)</span><input value={r.nota} maxLength={200} onChange={(e) => setR({ ...r, nota: e.target.value })} /></label>
          </div>
          <button type="button" className="btn pri grande" onClick={() => void gravar()}>Salvar registro</button>
        </>
      )}
    </>
  );
}

function Espera({ aoTerminar, pausar }: { aoTerminar: (esperou: boolean) => void; pausar: () => void }) {
  const [resta, setResta] = useState(600);
  useEffect(() => { const t = setInterval(() => setResta((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);
  const mm = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, "0")}`;
  return (
    <>
      <p><b>Um convite: esperar 10 minutos.</b> Às vezes a vontade passa, às vezes não. Os dois estão certos. Você decide.</p>
      <div className="kaya-respira" style={{ ["--k" as string]: 1 }}>{mm}</div>
      <div className="linha-botoes" style={{ justifyContent: "center" }}>
        <button type="button" className="btn suave" onClick={pausar}><Wind />Pausa guiada</button>
        <button type="button" className="btn pri" onClick={() => aoTerminar(resta === 0)}>{resta === 0 ? "Continuar" : "Seguir para o registro"}</button>
      </div>
    </>
  );
}

// ---------- Pausa consciente ----------
export function PausaConsciente({ fechar }: { fechar: () => void }) {
  const aviso = useAviso();
  const [modo, setModo] = useState<Pausa["modo"] | "">("");
  const [seg, setSeg] = useState(0);
  const [fase, setFase] = useState("Inspire");
  const inicio = useRef(0);
  const [fim, setFim] = useState(false);
  useEffect(() => {
    if (!modo || fim) return;
    inicio.current = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000); setSeg(s);
      const c = s % 12; setFase(c < 4 ? "Inspire" : c < 6 ? "Segure" : "Solte devagar");
    }, 250);
    return () => clearInterval(t);
  }, [modo, fim]);
  async function terminar(seguiu?: boolean) {
    await salvar<Pausa>({ tipo: "pausa", quando: new Date().toISOString(), modo: modo as Pausa["modo"], segundos: seg, seguiuSemUsar: seguiu });
    aviso("Pausa registrada. Cuidar de você também é isso."); setFim(false); setModo(""); setSeg(0); fechar();
  }
  if (!modo) return (
    <>
      <p className="muted">Sempre um convite, nunca um bloqueio. Escolha como quer fazer.</p>
      <div className="menu-lista">
        {([["respiracao", "Respiração guiada", "4 segundos inspira, 2 segura, 6 solta.", Wind], ["onda", "Surfar a vontade", "Observar a vontade subir e descer, sem agir.", Feather], ["timer", "Só um timer", "Um tempo em silêncio, do seu jeito.", Pause]] as const).map(([m, t, d, I]) => (
          <button key={m} type="button" onClick={() => setModo(m)}><span className="ic-m"><I /></span><span>{t}<small>{d}</small></span><ChevronRight /></button>
        ))}
      </div>
    </>
  );
  const k = fase === "Solte devagar" ? 0.7 : 1;
  return (
    <>
      {modo === "onda" && <p>A vontade sobe como uma onda, chega ao pico e desce. Observe onde ela aparece no corpo. Você não precisa fazer nada com ela.</p>}
      <div className="kaya-respira" style={{ ["--k" as string]: modo === "timer" ? 1 : k }}>{modo === "timer" ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}` : fase}</div>
      <p className="muted" style={{ textAlign: "center" }}>{Math.floor(seg / 60)} min {seg % 60} s</p>
      {fim ? (
        <><b style={{ textAlign: "center" }}>A vontade passou?</b>
        <div className="linha-botoes" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" onClick={() => void terminar(true)}>Sim, passou</button>
          <button type="button" className="btn" onClick={() => void terminar(false)}>Ainda não</button>
          <button type="button" className="btn fantasma" onClick={() => void terminar(undefined)}>Prefiro não dizer</button></div></>
      ) : <button type="button" className="btn pri grande" onClick={() => setFim(true)}>Encerrar pausa</button>}
    </>
  );
}

// ---------- Diário ----------
export function NovoDiario({ fechar }: { fechar: () => void }) {
  const { itens } = useKaya();
  const aviso = useAviso();
  const p = perfilDe(itens)!;
  const prompts = PROMPTS_DIARIO[p.perfilUso].map((x) => x.replace("{t}", termo(p)));
  const [pergunta, setPergunta] = useState(prompts[new Date().getDate() % prompts.length]);
  const [texto, setTexto] = useState(""), [emo, setEmo] = useState<string[]>([]);
  return (
    <>
      <div className="campo"><span>Uma pergunta para começar (opcional)</span><div className="kaya-chips">{prompts.map((x) => <button key={x} type="button" className="kaya-chip" aria-pressed={pergunta === x} onClick={() => setPergunta(x)}>{x}</button>)}</div></div>
      <textarea rows={5} maxLength={4000} value={texto} placeholder={pergunta} onChange={(e) => setTexto(e.target.value)} aria-label="Texto do diário" />
      <div className="campo"><span>Emoções</span><ChipsMulti rotulo="Emoções" ops={OP.emocoes.map((e) => [e, e] as const)} valor={emo} mudar={setEmo} /></div>
      <button type="button" className="btn pri grande" disabled={!texto.trim()} onClick={() => void salvar<Diario>({ tipo: "diario", quando: new Date().toISOString(), texto: texto.trim(), emocoes: emo, pergunta }).then(() => { aviso("Guardado no seu diário."); fechar(); })}><PenLine />Guardar</button>
    </>
  );
}

export function DiarioTela({ novo }: { novo: () => void }) {
  const { itens } = useKaya();
  const lista = de(itens, "diario").sort((a, b) => b.quando.localeCompare(a.quando));
  const emocoes = new Map<string, number>(); for (const d of lista.slice(0, 30)) for (const e of d.emocoes) emocoes.set(e, (emocoes.get(e) ?? 0) + 1);
  return (
    <>
      <div className="atalhos" style={{ gridTemplateColumns: "1fr" }}><button type="button" className="btn" onClick={novo}><span className="bolha"><PenLine size={18} /></span>Escrever agora</button></div>
      {emocoes.size > 0 && <section className="card"><div className="cab"><h2>Emoções mais presentes</h2><span className="chip">últimas 30</span></div><div className="kaya-chips">{[...emocoes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([e, n]) => <span key={e} className="pill pago">{e} · {n}</span>)}</div></section>}
      {lista.length ? lista.slice(0, 60).map((d) => (
        <section key={d.id} className="card">
          <div className="cab"><span className="muted" style={{ fontSize: ".82rem" }}>{quando(d.quando)}</span>{d.emocoes.length > 0 && <span className="chip">{d.emocoes.slice(0, 2).join(" · ")}</span>}</div>
          {d.pergunta && <span className="muted" style={{ fontStyle: "italic", fontSize: ".86rem" }}>{d.pergunta}</span>}
          <div style={{ whiteSpace: "pre-wrap" }}>{d.texto}</div>
        </section>
      )) : <section className="card"><div className="vazio"><PenLine /><div>Seu diário é só seu, cifrado. Escreva quando quiser.</div></div></section>}
    </>
  );
}

// ---------- Insights (no aparelho, comparando você com você) ----------
export function Insights() {
  const { itens } = useKaya();
  const s = semana(itens);
  const regs = de(itens, "registro");
  const d = useMemo(() => {
    const gatilhos = new Map<string, number>(); for (const r of regs) for (const c of r.contexto) gatilhos.set(c, (gatilhos.get(c) ?? 0) + 1);
    const top = [...gatilhos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const comDepois = regs.filter((r) => r.humorDepois);
    const delta = (lista: Registro[]) => (lista.length ? lista.reduce((a, r) => a + (r.humorDepois! - r.humorAntes), 0) / lista.length : null);
    const pausas = de(itens, "pausa");
    const horas = [0, 0, 0, 0]; for (const r of regs) horas[Math.floor(new Date(r.quando).getHours() / 6)]++;
    return { top, deltaInt: delta(comDepois.filter((r) => r.escolha === "intencional")), deltaAuto: delta(comDepois.filter((r) => r.escolha === "automatico")), pausas: pausas.length, passou: pausas.filter((x) => x.seguiuSemUsar).length, horas, gasto: gastoDoMes(itens) };
  }, [regs, itens]);
  const maxTop = Math.max(1, ...d.top.map((x) => x[1])); const maxH = Math.max(1, ...d.horas);
  const fmt = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);
  return (
    <>
      <div className="kpis">
        <div className="kpi-card principal"><span className="rotulo">Dias de pausa (7 dias)</span><span className="v num">{s.diasSem}</span></div>
        <div className="kpi-card"><span className="rotulo">Registros (7 dias)</span><span className="v num">{s.total}</span></div>
        <div className="kpi-card"><span className="rotulo">Pausas feitas</span><span className="v num">{d.pausas}</span></div>
        <div className="kpi-card"><span className="rotulo">Gasto do mês</span><span className="v num">{reais(d.gasto)}</span></div>
      </div>
      <div className="grade-dash">
        <section className="card largo">
          <div className="cab"><h2>Últimos 7 dias</h2><span className="chip">{s.leitura}</span></div>
          <div className="kaya-semana">{s.porDia.map((n, i) => <div key={i}><i style={{ height: `${Math.max(3, (n / Math.max(1, ...s.porDia)) * 80)}px`, opacity: n ? 1 : 0.35 }} /><span>{["D", "S", "T", "Q", "Q", "S", "S"][new Date(`${s.dias[i]}T12:00`).getDay()]}</span></div>)}</div>
          {s.anterior > 0 && <span className="muted">Semana anterior: {s.anterior} registro{s.anterior === 1 ? "" : "s"}.</span>}
        </section>
        <section className="card">
          <div className="cab"><h2>Intenção x resultado</h2></div>
          <div className="duas"><div className="kpi"><span className="k">Humor depois, com intenção</span><span className="v num">{fmt(d.deltaInt)}</span></div><div className="kpi"><span className="k">No automático</span><span className="v num">{fmt(d.deltaAuto)}</span></div></div>
          <span className="muted" style={{ fontSize: ".85rem" }}>Diferença média entre o humor antes e depois. Complete o "depois" nos registros para esta leitura ficar mais fiel.</span>
        </section>
        <section className="card">
          <div className="cab"><h2>Contextos mais comuns</h2></div>
          {d.top.length ? <div className="barras">{d.top.map(([c, n]) => <div className="barra" key={c}><span className="ponto" style={{ background: "var(--terra)" }} /><span className="nm">{rotulo(OP.contexto, c)}</span><span className="trilho"><i style={{ width: `${(n / maxTop) * 100}%`, background: "var(--terra)" }} /></span><span className="num">{n}</span></div>)}</div>
            : <div className="vazio"><div>Aparecem conforme você registra.</div></div>}
        </section>
        <section className="card">
          <div className="cab"><h2>Horários</h2></div>
          <div className="barras">{["Madrugada", "Manhã", "Tarde", "Noite"].map((n, i) => <div className="barra" key={n}><span className="ponto" /><span className="nm">{n}</span><span className="trilho"><i style={{ width: `${(d.horas[i] / maxH) * 100}%` }} /></span><span className="num">{d.horas[i]}</span></div>)}</div>
        </section>
        <section className="card">
          <div className="cab"><h2>Pausas</h2></div>
          <span>{d.pausas} {d.pausas === 1 ? "pausa feita" : "pausas feitas"}{d.passou ? `; em ${d.passou} a vontade passou` : ""}.</span>
        </section>
      </div>
      <p className="kaya-disclaimer">Comparação sempre com você mesmo(a). Aqui é só um espelho do que você registrou.</p>
    </>
  );
}

// ---------- Pacto, Gastos, Medicinal ----------
export function Pacto() {
  const { itens } = useKaya();
  const regras = de(itens, "regra");
  const [nova, setNova] = useState("");
  const hoje = hojeIso();
  return (
    <Secao titulo="Pacto pessoal">
      <p className="muted">Regras que você mesmo(a) criou. Marque como foi hoje.</p>
      <div className="kaya-lista">{regras.map((r) => {
        const sem = Object.entries(r.historico).filter(([d]) => (Date.now() - new Date(`${d}T12:00`).getTime()) / 86_400_000 < 7);
        const sim = sem.filter(([, v]) => v).length;
        return (
          <div key={r.id} style={{ display: "grid", gap: 6 }}>
            <b style={{ fontWeight: 600, opacity: r.ativa ? 1 : 0.5 }}>{r.texto}</b>
            <small className="muted">Últimos 7 dias: {sim} de {sem.length} marcados como cumpridos</small>
            <div className="linha-botoes">
              <button type="button" className="kaya-chip" aria-pressed={r.historico[hoje] === true} onClick={() => void salvar<Regra>({ ...r, historico: { ...r.historico, [hoje]: true } }, r.id)}>Cumpri hoje</button>
              <button type="button" className="kaya-chip" aria-pressed={r.historico[hoje] === false} onClick={() => void salvar<Regra>({ ...r, historico: { ...r.historico, [hoje]: false } }, r.id)}>Não hoje</button>
              <button type="button" className="btn fantasma" onClick={() => void salvar<Regra>({ ...r, ativa: !r.ativa }, r.id)}>{r.ativa ? "Pausar regra" : "Reativar"}</button>
            </div>
          </div>
        );
      })}</div>
      <div className="busca"><input value={nova} maxLength={80} placeholder="Nova regra" onChange={(e) => setNova(e.target.value)} aria-label="Nova regra" />
        <button type="button" className="btn" disabled={!nova.trim()} onClick={() => void salvar<Regra>({ tipo: "regra", texto: nova.trim(), ativa: true, criadoEm: new Date().toISOString(), historico: {} }).then(() => setNova(""))}>Adicionar</button></div>
    </Secao>
  );
}

export function Gastos() {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const [valor, setValor] = useState(""), [nota, setNota] = useState(""), [orc, setOrc] = useState(p.orcamento ? String(p.orcamento / 100).replace(".", ",") : "");
  const meses = [0, 1, 2].map((i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return diaLocal(d.toISOString()).slice(0, 7); });
  const media = gastoDoMes(itens, meses[1]);
  return (
    <Secao titulo="Gastos">
      {meses.map((m) => <span key={m}>{m.split("-").reverse().join("/")}: <b>{reais(gastoDoMes(itens, m))}</b></span>)}
      {media > 0 && <span className="muted">Se você reduzir 25% em relação ao mês passado, economiza cerca de {reais(media * 0.25)} por mês ({reais(media * 0.25 * 12)} em um ano).</span>}
      <div className="busca"><input inputMode="decimal" value={valor} placeholder="R$ 0,00" onChange={(e) => setValor(e.target.value)} aria-label="Valor" /><input value={nota} placeholder="Nota" maxLength={60} onChange={(e) => setNota(e.target.value)} aria-label="Nota" />
        <button type="button" className="btn" disabled={!lerReais(valor)} onClick={() => void salvar<Gasto>({ tipo: "gasto", quando: new Date().toISOString(), valor: lerReais(valor)!, nota: nota || undefined }).then(() => { setValor(""); setNota(""); })}>Lançar</button></div>
      <label className="campo"><span>Orçamento mensal</span><div className="busca"><input inputMode="decimal" value={orc} onChange={(e) => setOrc(e.target.value)} /><button type="button" className="btn" onClick={() => void salvar<Perfil>({ ...p, orcamento: lerReais(orc) }, ID_PERFIL)}>Salvar</button></div></label>
    </Secao>
  );
}

export function Medicinal() {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const [s, setS] = useState<Partial<Sintoma>>({});
  const lista = de(itens, "sintoma").sort((a, b) => b.quando.localeCompare(a.quando));
  async function pdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF(); let y = 16;
    const linha = (t: string, tam = 10) => { doc.setFontSize(tam); for (const l of doc.splitTextToSize(t, 180)) { if (y > 280) { doc.addPage(); y = 16; } doc.text(l, 14, y); y += tam * 0.5 + 2; } };
    linha("Relatório de acompanhamento — registros do paciente", 14);
    linha(`Gerado em ${new Date().toLocaleDateString("pt-BR")}. Finalidades: ${p.saude.map((x) => rotulo(OP.saude, x)).join(", ") || "não informadas"}. Acompanhamento: ${rotulo(OP.acompanhamento, p.acompanhamento) || "não informado"}.`);
    linha("Documento gerado pelo próprio paciente, sem recomendação de dose ou tratamento. " + DISCLAIMER, 9);
    y += 4; linha("Sintomas (0 a 10)", 12);
    for (const x of lista.slice(0, 90)) linha(`${quando(x.quando)} — dor ${x.dor ?? "-"}, sono ${x.sono ?? "-"}, ansiedade ${x.ansiedade ?? "-"}, apetite ${x.apetite ?? "-"}${x.colaterais ? `; efeitos: ${x.colaterais}` : ""}`);
    y += 4; linha("Registros de uso (últimos 60)", 12);
    for (const r of de(itens, "registro").sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 60)) linha(`${quando(r.quando)} — ${rotulo(OP.formas, r.forma)}, ${r.quantidade}; humor ${r.humorAntes}→${r.humorDepois ?? "-"}`);
    doc.save(`relatorio-${hojeIso()}.pdf`);
  }
  return (
    <>
      <Secao titulo="Sintomas de hoje">
        <Escala rotulo="Dor" valor={s.dor} mudar={(v) => setS({ ...s, dor: v })} legenda={["nenhuma", "máxima"]} />
        <Escala rotulo="Qualidade do sono" valor={s.sono} mudar={(v) => setS({ ...s, sono: v })} legenda={["péssima", "ótima"]} />
        <Escala rotulo="Ansiedade" valor={s.ansiedade} mudar={(v) => setS({ ...s, ansiedade: v })} legenda={["nenhuma", "máxima"]} />
        <Escala rotulo="Apetite" valor={s.apetite} mudar={(v) => setS({ ...s, apetite: v })} legenda={["nenhum", "muito"]} />
        <label className="campo"><span>Efeitos colaterais (opcional)</span><input value={s.colaterais ?? ""} maxLength={200} onChange={(e) => setS({ ...s, colaterais: e.target.value })} /></label>
        <button type="button" className="btn pri" onClick={() => void salvar<Sintoma>({ tipo: "sintoma", quando: new Date().toISOString(), ...s }).then(() => setS({}))}>Salvar</button>
      </Secao>
      <Secao titulo="Relatório para o profissional de saúde">
        <p className="muted">Um PDF com seus sintomas e registros, para levar à consulta. Não contém sugestão de dose.</p>
        <button type="button" className="btn" onClick={() => void pdf()}>Gerar PDF</button>
      </Secao>
    </>
  );
}
