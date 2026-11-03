import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { db, novoId, type Meta } from "../db";
import { hoje, mesAtual } from "../lib/calc";
import { dataCurta, dinheiro, lerValor, mesExtenso, numeroBR } from "../lib/format";
import { BotaoConfirmar, CORES, Campo, Folha, ICONES, IconeCategoria, useAviso, useDinheiro, type DadosApp } from "../components/ui";
import { CampoMesOpcional, InputValor } from "../components/campos";

const ICONES_META = ["piggy", "plane", "home", "car", "school", "heart", "monitor", "briefcase", "landmark", "cart"];

export function mesesAte(prazo?: string) {
  if (!prazo) return undefined;
  const [a, m] = mesAtual().split("-").map(Number);
  const [pa, pm] = prazo.split("-").map(Number);
  return Math.max(0, (pa - a) * 12 + (pm - m));
}

export function resumoMeta(m: Meta) {
  const pct = m.alvo ? Math.min(100, (m.guardado / m.alvo) * 100) : 0;
  const falta = Math.max(0, m.alvo - m.guardado);
  const meses = mesesAte(m.prazo);
  const porMes = meses ? Math.ceil(falta / meses) : undefined;
  return { pct, falta, meses, porMes };
}

export function ItemMeta({ m, abrir }: { m: Meta; abrir: () => void }) {
  const r = resumoMeta(m);
  const $ = useDinheiro();
  return (
    <button type="button" className="meta-item" onClick={abrir}>
      <div className="lin">
        <IconeCategoria icone={m.icone} cor={m.cor} />
        <div>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</div>
          <div className="muted num" style={{ fontSize: ".8rem" }}>
            {$(m.guardado)} / {$(m.alvo)}
            {r.falta === 0 ? " · concluída" : r.meses !== undefined ? ` · ${r.meses === 0 ? "prazo neste mês" : `faltam ${r.meses} ${r.meses === 1 ? "mês" : "meses"}`}` : ""}
          </div>
        </div>
        <span className="pct num">{Math.round(r.pct)}%</span>
      </div>
      <div className="trilho-prog"><i style={{ width: `${r.pct}%`, background: m.cor }} /></div>
    </button>
  );
}

export function Metas({ dados }: { dados: DadosApp }) {
  const [edit, setEdit] = useState<Partial<Meta> | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const metas = [...dados.metas].sort((a, b) => resumoMeta(a).pct - resumoMeta(b).pct);
  const total = metas.reduce((a, m) => a + m.guardado, 0);
  const alvo = metas.reduce((a, m) => a + m.alvo, 0);

  return (
    <>
      <div className="kpis">
        <div className="kpi-card"><span className="rotulo">Já guardado</span><span className="v num pos">{dinheiro(total)}</span></div>
        <div className="kpi-card"><span className="rotulo">Somando as metas</span><span className="v num">{dinheiro(alvo)}</span></div>
      </div>
      <section className="card">
        <div className="cab"><h2>Metas em andamento</h2><button type="button" className="btn suave" onClick={() => setEdit({ cor: CORES[0], icone: "piggy" })}><Plus />Nova meta</button></div>
        {metas.length === 0 ? (
          <div className="vazio"><Target /><div>Crie uma meta (viagem, reserva de emergência, um equipamento) e registre quanto vai guardando. O app mostra quanto falta por mês.</div></div>
        ) : <div className="lista">{metas.map((m) => <ItemMeta key={m.id} m={m} abrir={() => setAberta(m.id)} />)}</div>}
      </section>
      {aberta && <DetalheMeta m={dados.metas.find((m) => m.id === aberta)!} fechar={() => setAberta(null)} editar={(m) => { setAberta(null); setEdit(m); }} />}
      <EditarMeta edit={edit} fechar={() => setEdit(null)} />
    </>
  );
}

function DetalheMeta({ m, fechar, editar }: { m: Meta; fechar: () => void; editar: (m: Meta) => void }) {
  const aviso = useAviso();
  const [valor, setValor] = useState("");
  if (!m) return null;
  const r = resumoMeta(m);
  async function movimentar(sinal: 1 | -1) {
    const v = lerValor(valor) ?? 0;
    if (v <= 0) { aviso("Informe um valor."); return; }
    const guardado = Math.max(0, m.guardado + sinal * v);
    await db.metas.update(m.id, { guardado, aportes: [...m.aportes, { data: hoje(), valor: sinal * v }] });
    setValor("");
    aviso(sinal > 0 ? `${dinheiro(v)} guardados.` : `${dinheiro(v)} retirados.`);
  }
  return (
    <Folha titulo={m.nome} aberta fechar={fechar} acoes={<button type="button" className="btn" onClick={() => editar(m)}>Editar</button>}>
      <div className="bloco">
        <div className="cab"><span className="rotulo">Progresso</span><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.2rem" }}>{Math.round(r.pct)}%</b></div>
        <div className="trilho-prog"><i style={{ width: `${r.pct}%`, background: m.cor }} /></div>
        <div className="cab"><span className="num">{dinheiro(m.guardado)} de {dinheiro(m.alvo)}</span><span className="muted num">falta {dinheiro(r.falta)}</span></div>
        {r.porMes ? <span className="muted" style={{ fontSize: ".86rem" }}>Para chegar até {mesExtenso(m.prazo!)}: guarde {dinheiro(r.porMes)} por mês.</span> : null}
      </div>
      <Campo rotulo="Valor"><InputValor id="mt-valor" value={valor} onChange={setValor} /></Campo>
      <div className="linha-botoes">
        <button type="button" className="btn pri" onClick={() => movimentar(1)}>Guardar</button>
        <button type="button" className="btn" onClick={() => movimentar(-1)}>Retirar</button>
      </div>
      {m.aportes.length > 0 && (
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <h2 style={{ fontSize: ".95rem" }}>Histórico</h2>
          {[...m.aportes].reverse().slice(0, 10).map((a, i) => (
            <div key={i} className="cab" style={{ fontSize: ".88rem" }}><span className="muted">{dataCurta(a.data)}</span><b className={`num ${a.valor >= 0 ? "pos" : "neg"}`}>{a.valor >= 0 ? "+" : "-"}{dinheiro(Math.abs(a.valor))}</b></div>
          ))}
        </div>
      )}
    </Folha>
  );
}

function EditarMeta({ edit, fechar }: { edit: Partial<Meta> | null; fechar: () => void }) {
  const aviso = useAviso();
  const [form, setForm] = useState<Partial<Meta> & { alvoTxt?: string; guardadoTxt?: string }>({});
  const [carregado, setCarregado] = useState<Partial<Meta> | null>(null);
  if (edit !== carregado) {
    setCarregado(edit);
    setForm(edit ? { ...edit, alvoTxt: edit.alvo ? numeroBR(edit.alvo) : "", guardadoTxt: edit.guardado ? numeroBR(edit.guardado) : "" } : {});
  }
  if (!edit) return null;
  async function salvar() {
    const alvo = lerValor(form.alvoTxt ?? "") ?? 0;
    if (!form.nome?.trim()) { aviso("Dê um nome à meta."); return; }
    if (alvo <= 0) { aviso("Informe o valor da meta."); return; }
    const guardado = lerValor(form.guardadoTxt ?? "") ?? 0;
    const existente = edit?.id ? await db.metas.get(edit.id) : undefined;
    await db.metas.put({
      id: edit?.id ?? novoId(), nome: form.nome.trim(), alvo, guardado, prazo: form.prazo || undefined,
      icone: form.icone ?? "piggy", cor: form.cor ?? CORES[0], aportes: existente?.aportes ?? (guardado ? [{ data: hoje(), valor: guardado }] : []),
      criadoEm: existente?.criadoEm ?? new Date().toISOString(),
    });
    aviso("Meta salva."); fechar();
  }
  return (
    <Folha titulo={edit.id ? "Editar meta" : "Nova meta"} aberta fechar={fechar}>
      <Campo rotulo="Nome"><input id="me-nome" value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Reserva de emergência" maxLength={60} /></Campo>
      <div className="duas">
        <Campo rotulo="Quanto quer juntar"><InputValor id="me-alvo" value={form.alvoTxt ?? ""} onChange={(v) => setForm({ ...form, alvoTxt: v })} /></Campo>
        <Campo rotulo="Já tem guardado"><InputValor id="me-guard" value={form.guardadoTxt ?? ""} onChange={(v) => setForm({ ...form, guardadoTxt: v })} /></Campo>
      </div>
      <div className="campo"><span>Até quando (opcional)</span><CampoMesOpcional valor={form.prazo ?? ""} mudar={(m) => setForm({ ...form, prazo: m && m < mesAtual() ? mesAtual() : m })} /></div>
      <div className="campo"><span>Ícone</span>
        <div className="cores">{ICONES_META.map((k) => { const I = ICONES[k]; const on = (form.icone ?? "piggy") === k; const cor = form.cor ?? CORES[0];
          return <button key={k} type="button" aria-label={`Ícone ${k}`} aria-pressed={on} onClick={() => setForm({ ...form, icone: k })} style={{ display: "grid", placeItems: "center", width: 42, height: 42, background: on ? `color-mix(in srgb, ${cor} 18%, var(--surface))` : "var(--surface-2)", color: on ? cor : "var(--muted)" }}><I size={18} /></button>; })}
        </div>
      </div>
      <div className="campo"><span>Cor</span><div className="cores">{CORES.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={(form.cor ?? CORES[0]) === c} style={{ background: c }} onClick={() => setForm({ ...form, cor: c })} />)}</div></div>
      <div className="linha-botoes" style={{ justifyContent: "space-between" }}>
        {edit.id ? <BotaoConfirmar confirmar="Toque de novo para excluir" onConfirm={async () => { await db.metas.delete(edit.id!); aviso("Meta excluída."); fechar(); }}>Excluir</BotaoConfirmar> : <span />}
        <button type="button" className="btn pri" onClick={salvar}>Salvar</button>
      </div>
    </Folha>
  );
}
