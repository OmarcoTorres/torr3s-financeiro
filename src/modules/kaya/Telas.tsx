import { useEffect, useMemo, useRef, useState } from "react";
import { Feather, Pause, PenLine, Plus, Wind } from "lucide-react";
import { ID_PERFIL, salvar, useKaya } from "./dados";
import { Chips, ChipsMulti, Escala, Humor, Secao, diaLocal, hojeIso, lerReais, quando, reais } from "./pecas";
import { DISCLAIMER, OP, PROMPTS_DIARIO, fraseDoDia, rotulo, termo } from "./textos";
import type { ComId, Diario, Gasto, Item, Pausa, Perfil, Registro, Regra, Sintoma } from "./tipos";

export const de = <T extends Item["tipo"]>(itens: ComId<Item>[], tipo: T) => itens.filter((x) => x.tipo === tipo) as ComId<Extract<Item, { tipo: T }>>[];
export const perfilDe = (itens: ComId<Item>[]) => itens.find((x) => x.tipo === "perfil") as ComId<Perfil> | undefined;
const mesAtual = () => hojeIso().slice(0, 7);
export function gastoDoMes(itens: ComId<Item>[], mes = mesAtual()) {
  return de(itens, "registro").filter((r) => diaLocal(r.quando).startsWith(mes)).reduce((a, r) => a + (r.custo ?? 0), 0)
    + de(itens, "gasto").filter((g) => diaLocal(g.quando).startsWith(mes)).reduce((a, g) => a + g.valor, 0);
}

// ---------- Home ----------
export function Home({ registrar, pausar }: { registrar: () => void; pausar: () => void }) {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const hoje = hojeIso();
  const regsHoje = de(itens, "registro").filter((r) => diaLocal(r.quando) === hoje);
  const pausasHoje = de(itens, "pausa").filter((r) => diaLocal(r.quando) === hoje);
  const gasto = gastoDoMes(itens);
  const pct = p.orcamento ? Math.round((gasto / p.orcamento) * 100) : 0;
  return (
    <>
      <div className="kaya-intencao">
        <small>{p.apelido || "Você"} · seu norte</small>
        <div className="norte">{p.norte || "Registrar com honestidade e escolher com calma."}</div>
      </div>
      <p className="titulo" style={{ fontSize: "1.05rem", margin: "2px 4px" }}>{fraseDoDia()}</p>
      <div className="linha-botoes" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <button type="button" className="btn pri grande" onClick={registrar}><Plus />Registrar</button>
        <button type="button" className="btn suave grande" onClick={pausar}><Pause />Preciso de uma pausa</button>
      </div>
      <Secao titulo="Hoje">
        <span>{regsHoje.length ? `${regsHoje.length} registro${regsHoje.length > 1 ? "s" : ""}` : "Nenhum registro"} · {pausasHoje.length} pausa{pausasHoje.length === 1 ? "" : "s"}</span>
        {regsHoje.map((r) => <span key={r.id} className="muted" style={{ fontSize: ".86rem" }}>{quando(r.quando)} · {rotulo(OP.formas, r.forma)} · {r.escolha === "intencional" ? "com intenção" : "no automático"}</span>)}
      </Secao>
      {p.orcamento ? (
        <Secao titulo="Gasto do mês">
          <span><b>{reais(gasto)}</b> de {reais(p.orcamento)}</span>
          <div className={`kaya-barra-gasto ${pct >= 80 ? "alto" : ""}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
          {pct >= 100 ? <span className="muted">Você chegou ao orçamento que definiu. Que tal olhar com calma o que trouxe até aqui?</span>
            : pct >= 80 ? <span className="muted">Você já usou {pct}% do orçamento do mês.</span> : null}
        </Secao>
      ) : null}
      <p className="kaya-disclaimer">{DISCLAIMER}</p>
    </>
  );
}

// ---------- Registrar (check-in opcional + registro rápido) ----------
export function Registrar({ fechar }: { fechar: () => void }) {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const [etapa, setEtapa] = useState<"checkin" | "espera" | "registro">("checkin");
  const [ck, setCk] = useState({ porque: "", como: "", espera: "" });
  const [esperou, setEsperou] = useState(false);
  const [r, setR] = useState({ forma: p.formas[0] ?? "", quantidade: "" as Registro["quantidade"] | "", contexto: [] as string[], humorAntes: 0, humorDepois: 0, custo: "", escolha: "" as Registro["escolha"] | "", nota: "" });
  const [ok, setOk] = useState(false);
  const temCk = !!(ck.porque || ck.como || ck.espera);
  async function gravar() {
    await salvar<Registro>({
      tipo: "registro", quando: new Date().toISOString(), forma: r.forma, quantidade: (r.quantidade || "moderado") as Registro["quantidade"], contexto: r.contexto,
      humorAntes: r.humorAntes || 3, humorDepois: r.humorDepois || undefined, custo: lerReais(r.custo), escolha: (r.escolha || (temCk ? "intencional" : "automatico")) as Registro["escolha"],
      checkin: temCk ? { ...ck, esperou10: esperou } : undefined, nota: r.nota.trim() || undefined,
    });
    setOk(true);
  }
  if (ok) return <Secao titulo="Registrado"><p>Obrigado pela honestidade. Registrar é cuidar.</p><button type="button" className="btn pri" onClick={fechar}>Voltar ao início</button></Secao>;
  if (etapa === "checkin") return (
    <Secao titulo="Check-in de intenção">
      <p className="muted">Três perguntas rápidas. Pode pular.</p>
      <label className="campo"><span>Por que agora?</span><input value={ck.porque} maxLength={120} onChange={(e) => setCk({ ...ck, porque: e.target.value })} /></label>
      <label className="campo"><span>Como você está?</span><input value={ck.como} maxLength={120} onChange={(e) => setCk({ ...ck, como: e.target.value })} /></label>
      <label className="campo"><span>O que você espera sentir?</span><input value={ck.espera} maxLength={120} onChange={(e) => setCk({ ...ck, espera: e.target.value })} /></label>
      <div className="linha-botoes"><button type="button" className="btn pri" onClick={() => setEtapa("espera")}>Continuar</button><button type="button" className="btn fantasma" onClick={() => setEtapa("registro")}>Pular</button></div>
    </Secao>
  );
  if (etapa === "espera") return <Espera aoTerminar={(e) => { setEsperou(e); setEtapa("registro"); }} />;
  return (
    <Secao titulo="Registro">
      <div className="campo"><span>Forma</span><Chips rotulo="Forma" ops={OP.formas} valor={r.forma} mudar={(v) => setR({ ...r, forma: v })} /></div>
      <div className="campo"><span>Quantidade percebida</span><Chips rotulo="Quantidade" ops={OP.quantidade} valor={r.quantidade} mudar={(v) => setR({ ...r, quantidade: v as Registro["quantidade"] })} /></div>
      <div className="campo"><span>Contexto</span><ChipsMulti rotulo="Contexto" ops={OP.contexto} valor={r.contexto} mudar={(v) => setR({ ...r, contexto: v })} /></div>
      <Humor rotulo="Humor antes" valor={r.humorAntes} mudar={(v) => setR({ ...r, humorAntes: v })} />
      <Humor rotulo="Humor depois (pode completar depois)" valor={r.humorDepois} mudar={(v) => setR({ ...r, humorDepois: v })} />
      <div className="campo"><span>Foi uma escolha…</span><Chips rotulo="Escolha" ops={[["intencional", "Com intenção"], ["automatico", "No automático"]]} valor={r.escolha} mudar={(v) => setR({ ...r, escolha: v as Registro["escolha"] })} /></div>
      <label className="campo"><span>Custo (opcional)</span><input inputMode="decimal" value={r.custo} placeholder="R$ 0,00" onChange={(e) => setR({ ...r, custo: e.target.value })} /></label>
      <label className="campo"><span>Nota (opcional)</span><textarea rows={2} maxLength={500} value={r.nota} onChange={(e) => setR({ ...r, nota: e.target.value })} /></label>
      <div className="linha-botoes"><button type="button" className="btn pri" onClick={() => void gravar()}>Salvar registro</button><button type="button" className="btn fantasma" onClick={fechar}>Cancelar</button></div>
    </Secao>
  );
}

function Espera({ aoTerminar }: { aoTerminar: (esperou: boolean) => void }) {
  const [resta, setResta] = useState(600);
  useEffect(() => { const t = setInterval(() => setResta((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);
  const mm = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, "0")}`;
  return (
    <Secao titulo="Um convite: esperar 10 minutos">
      <p>Às vezes a vontade passa, às vezes não. Os dois estão certos. Você decide.</p>
      <div className="kaya-respira" style={{ ["--k" as string]: 1 }}>{mm}</div>
      <div className="linha-botoes"><button type="button" className="btn pri" onClick={() => aoTerminar(resta === 0)}>{resta === 0 ? "Continuar" : "Seguir para o registro"}</button></div>
    </Secao>
  );
}

// ---------- Pausa consciente ----------
export function PausaConsciente() {
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
  async function terminar(seguiu?: boolean) { await salvar<Pausa>({ tipo: "pausa", quando: new Date().toISOString(), modo: modo as Pausa["modo"], segundos: seg, seguiuSemUsar: seguiu }); setFim(false); setModo(""); setSeg(0); }
  if (!modo) return (
    <Secao titulo="Pausa consciente">
      <p className="muted">Sempre um convite, nunca um bloqueio.</p>
      <button type="button" className="btn suave grande" onClick={() => setModo("respiracao")}><Wind />Respiração guiada</button>
      <button type="button" className="btn suave grande" onClick={() => setModo("onda")}><Feather />Surfar a vontade</button>
      <button type="button" className="btn suave grande" onClick={() => setModo("timer")}><Pause />Só um timer</button>
    </Secao>
  );
  const k = fase === "Inspire" ? 1 : fase === "Segure" ? 1 : 0.7;
  return (
    <Secao titulo={modo === "respiracao" ? "Respire comigo" : modo === "onda" ? "Surfar a vontade" : "Timer"}>
      {modo === "onda" && <p>A vontade sobe como uma onda, chega ao pico e desce. Observe onde ela aparece no corpo. Você não precisa fazer nada com ela.</p>}
      <div className="kaya-respira" style={{ ["--k" as string]: modo === "timer" ? 1 : k }}>{modo === "timer" ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}` : fase}</div>
      <p className="muted" style={{ textAlign: "center" }}>{Math.floor(seg / 60)} min {seg % 60} s</p>
      {fim ? (
        <div className="linha-botoes"><span>A vontade passou?</span>
          <button type="button" className="btn" onClick={() => void terminar(true)}>Sim, passou</button>
          <button type="button" className="btn" onClick={() => void terminar(false)}>Ainda não</button>
          <button type="button" className="btn fantasma" onClick={() => void terminar(undefined)}>Prefiro não dizer</button></div>
      ) : <button type="button" className="btn pri" onClick={() => setFim(true)}>Encerrar pausa</button>}
    </Secao>
  );
}

// ---------- Diário ----------
export function DiarioTela() {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const prompts = PROMPTS_DIARIO[p.perfilUso].map((x) => x.replace("{t}", termo(p)));
  const [pergunta, setPergunta] = useState(prompts[new Date().getDate() % prompts.length]);
  const [texto, setTexto] = useState(""), [emo, setEmo] = useState<string[]>([]);
  const lista = de(itens, "diario").sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30);
  return (
    <>
      <Secao titulo="Diário">
        <div className="kaya-chips">{prompts.map((x) => <button key={x} type="button" className="kaya-chip" aria-pressed={pergunta === x} onClick={() => setPergunta(x)}>{x}</button>)}</div>
        <textarea rows={4} maxLength={4000} value={texto} placeholder={pergunta} onChange={(e) => setTexto(e.target.value)} aria-label="Texto do diário" />
        <ChipsMulti rotulo="Emoções" ops={OP.emocoes.map((e) => [e, e] as const)} valor={emo} mudar={setEmo} />
        <button type="button" className="btn pri" disabled={!texto.trim()} onClick={() => void salvar<Diario>({ tipo: "diario", quando: new Date().toISOString(), texto: texto.trim(), emocoes: emo, pergunta }).then(() => { setTexto(""); setEmo([]); })}><PenLine />Guardar</button>
      </Secao>
      {lista.length > 0 && <Secao titulo="Anteriores"><div className="kaya-lista">{lista.map((d) => <div key={d.id}><small className="muted">{quando(d.quando)}{d.emocoes.length ? ` · ${d.emocoes.join(", ")}` : ""}</small><div style={{ whiteSpace: "pre-wrap" }}>{d.texto}</div></div>)}</div></Secao>}
    </>
  );
}

// ---------- Insights (no aparelho, comparando você com você) ----------
export function Insights() {
  const { itens } = useKaya();
  const regs = de(itens, "registro");
  const d = useMemo(() => {
    const hoje = new Date(); const dias: string[] = [];
    for (let i = 6; i >= 0; i--) { const x = new Date(hoje); x.setDate(x.getDate() - i); dias.push(diaLocal(x.toISOString())); }
    const porDia = dias.map((dd) => regs.filter((r) => diaLocal(r.quando) === dd).length);
    const semAnterior = regs.filter((r) => { const t = (Date.now() - new Date(r.quando).getTime()) / 86_400_000; return t >= 7 && t < 14; }).length;
    const semAtual = porDia.reduce((a, b) => a + b, 0);
    const gatilhos = new Map<string, number>(); for (const r of regs) for (const c of r.contexto) gatilhos.set(c, (gatilhos.get(c) ?? 0) + 1);
    const top = [...gatilhos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const intenc = regs.filter((r) => r.escolha === "intencional").length;
    const comDepois = regs.filter((r) => r.humorDepois);
    const deltaHumor = comDepois.length ? comDepois.reduce((a, r) => a + (r.humorDepois! - r.humorAntes), 0) / comDepois.length : null;
    const diasSem = dias.filter((_, i) => porDia[i] === 0).length;
    const pausas = de(itens, "pausa"); const passou = pausas.filter((x) => x.seguiuSemUsar).length;
    return { dias, porDia, semAtual, semAnterior, top, intenc, deltaHumor, diasSem, pausas: pausas.length, passou };
  }, [regs, itens]);
  const max = Math.max(1, ...d.porDia);
  const equilibrio = regs.length === 0 ? "Comece registrando para ver suas tendências." :
    d.diasSem >= 3 && d.intenc >= regs.length / 2 ? "Semana com espaço e intenção." : d.diasSem >= 2 ? "Há pausas na sua semana." : "Semana intensa. Observar já é um passo.";
  return (
    <>
      <Secao titulo="Últimos 7 dias">
        <div className="kaya-semana">{d.porDia.map((n, i) => <div key={i}><i style={{ height: `${Math.max(2, (n / max) * 80)}px`, opacity: n ? 1 : 0.35 }} /><span>{["D", "S", "T", "Q", "Q", "S", "S"][new Date(`${d.dias[i]}T12:00`).getDay()]}</span></div>)}</div>
        <span>{d.semAtual} registro{d.semAtual === 1 ? "" : "s"} · {d.diasSem} dia{d.diasSem === 1 ? "" : "s"} de pausa{d.semAnterior ? ` · semana anterior: ${d.semAnterior}` : ""}</span>
        <span className="muted">{equilibrio}</span>
      </Secao>
      <Secao titulo="Escolha x automático">
        <span>{regs.length ? `${Math.round((d.intenc / regs.length) * 100)}% dos registros foram com intenção.` : "Sem registros ainda."}</span>
        {d.deltaHumor !== null && <span className="muted">Em média, seu humor {d.deltaHumor > 0.2 ? "melhora" : d.deltaHumor < -0.2 ? "piora" : "fica parecido"} depois ({d.deltaHumor > 0 ? "+" : ""}{d.deltaHumor.toFixed(1)}).</span>}
      </Secao>
      <Secao titulo="Contextos mais comuns">{d.top.length ? d.top.map(([c, n]) => <span key={c}>{rotulo(OP.contexto, c)}: {n}</span>) : <span className="muted">Aparecem conforme você registra.</span>}</Secao>
      <Secao titulo="Pausas"><span>{d.pausas} {d.pausas === 1 ? "pausa feita" : "pausas feitas"}{d.passou ? `; em ${d.passou} a vontade passou` : ""}.</span></Secao>
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
