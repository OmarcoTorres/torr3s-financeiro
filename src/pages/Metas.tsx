import { useEffect, useState } from "react";
import { Heart, Plus, QrCode, Target, Users } from "lucide-react";
import { extrasDaMinhaMeta, guardarNaMetaDoGrupo, removerAporteDoGrupo, useGrupos, useGruposEstado, useTemaAtivo, type MetaGrupo } from "../lib/grupos";
import { frase, primeiroNome, temaDe } from "../lib/tema";
import { supabase } from "../lib/supabase";
import { CaixinhaDoGrupo } from "../components/Caixinha";
import { FormChavePix, PainelPix } from "../components/PixDireto";
import { useChavePix } from "../lib/chavePix";
import { SeuGrupo } from "../components/Grupo";
import { PedirPix } from "../components/PedidosPix";
import { celebrarDeposito, mensagemDeCarinho } from "../components/Coracoes";
import { useCaixinhasEstado } from "../lib/caixinha";
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

/** A meta com o que as outras pessoas do grupo guardaram somado ao "guardado". */
export function useMetaComGrupo(m: Meta) {
  const { metas } = useGruposEstado();
  const extra = m.grupoId ? extrasDaMinhaMeta(m.id, metas) : 0;
  return extra ? { ...m, guardado: m.guardado + extra } : m;
}

export function ItemMeta({ m: original, abrir }: { m: Meta; abrir: () => void }) {
  const m = useMetaComGrupo(original);
  const r = resumoMeta(m);
  const $ = useDinheiro();
  return (
    <button type="button" className="meta-item" onClick={abrir}>
      <div className="lin">
        <IconeCategoria icone={m.icone} cor={m.cor} />
        <div>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}{m.grupoId && <Users size={13} className="muted" style={{ marginLeft: 6, verticalAlign: "-1px" }} aria-label="Compartilhada com o grupo" />}</div>
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
  const [doGrupo, setDoGrupo] = useState<string | null>(null);
  const [grupoAberto, setGrupoAberto] = useState(false);
  const grupos = useGrupos();
  const meuId = useMeuId();
  const { tema, parceiros } = useTemaAtivo(meuId);
  const caixinhas = useCaixinhasEstado();
  const extra = (m: Meta) => (m.grupoId ? extrasDaMinhaMeta(m.id, grupos.metas) : 0);
  const metas = [...dados.metas].sort((a, b) => resumoMeta({ ...a, guardado: a.guardado + extra(a) }).pct - resumoMeta({ ...b, guardado: b.guardado + extra(b) }).pct);
  const dosOutros = grupos.metas.filter((m) => !m.minha);
  // Juntos: todas as metas compartilhadas (as minhas, com o valor local mais recente, e as dos outros).
  const compartilhadas = grupos.metas.map((m) => ({ m, partes: partesDaMeta(m, m.minha ? dados.metas.find((x) => x.id === m.id)?.guardado : undefined) }));
  const partesJuntos = juntarPartes(compartilhadas.map((c) => c.partes));
  const totalJuntos = partesJuntos.reduce((a, p) => a + p.valor, 0);
  const alvoJuntos = compartilhadas.reduce((a, c) => a + c.m.alvo, 0);

  const temGrupo = grupos.grupos.length > 0;
  const minhasCompartilhadas = metas.filter((m) => m.grupoId);
  const soMinhas = metas.filter((m) => !m.grupoId);
  const totalSoMinhas = soMinhas.reduce((a, m) => a + m.guardado, 0);
  const alvoSoMinhas = soMinhas.reduce((a, m) => a + m.alvo, 0);
  const novaMeta = (grupoId?: string) => setEdit({ cor: tema?.cor && grupoId ? tema.cor : CORES[0], icone: grupoId && tema ? tema.icone : "piggy", grupoId });
  const grupoPadrao = grupos.grupos[0]?.id;

  return (
    <>
      {/* 1) Juntos: o número principal do casal/grupo, com a parte de cada um. */}
      {temGrupo && (
        <section className="card" style={{ borderTop: tema ? `4px solid ${tema.cor}` : undefined }}>
          <div className="cab">
            <h2>{tema?.tituloMetas ?? "Metas do grupo"}</h2>
            <button type="button" className="btn fantasma" onClick={() => setGrupoAberto(true)}><Users size={16} />Grupo</button>
          </div>
          {compartilhadas.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span className="rotulo" style={{ width: "100%" }}>Juntos</span>
                <b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.8rem" }}>{dinheiro(totalJuntos)}</b>
                <span className="muted num">de {dinheiro(alvoJuntos)}</span>
              </div>
              <BarraDividida partes={partesJuntos} alvo={alvoJuntos} meuId={meuId} corTema={tema?.cor ?? "#d6457a"} />
              {tema && <span className="muted" style={{ fontSize: ".84rem" }}>{frase(tema.incentivos, { p: parceiros })}</span>}
              <div className="lista">
                {minhasCompartilhadas.map((m) => <ItemMeta key={m.id} m={m} abrir={() => setAberta(m.id)} />)}
                {dosOutros.map((m) => <ItemMetaGrupo key={`${m.espaco_id}:${m.id}`} m={m} abrir={() => setDoGrupo(`${m.espaco_id}:${m.id}`)} />)}
              </div>
            </>
          ) : (
            <div className="vazio"><Heart style={{ color: tema?.cor }} /><div>Crie o primeiro sonho de vocês. Cada um deposita na própria conta e o app soma tudo aqui.</div></div>
          )}
          <div className="linha-botoes">
            <button type="button" className="btn suave" onClick={() => novaMeta(grupoPadrao)}><Plus />{tema ? `Nova meta ${tema.tituloMetas.replace(/^Metas /, "")}` : "Nova meta do grupo"}</button>
          </div>
          {compartilhadas.length === 0 && tema && (
            <div className="linha-botoes">{tema.sugestoesMeta.slice(0, 4).map((n) => <button key={n} type="button" className="chip" onClick={() => setEdit({ nome: n, cor: tema.cor, icone: tema.icone, grupoId: grupoPadrao })}>{n}</button>)}</div>
          )}
        </section>
      )}

      {caixinhas.caixinhas.length > 0 && <CaixinhaDoGrupo meuId={meuId} />}
      <PedirPix meuId={meuId} />

      {/* 2) Só minhas: metas pessoais (fora do grupo), com o próprio total. */}
      <section className="card">
        <div className="cab">
          <div><h2>{temGrupo ? "Só minhas" : "Metas em andamento"}</h2>
            {soMinhas.length > 0 && <span className="muted num" style={{ fontSize: ".82rem" }}>{dinheiro(totalSoMinhas)} de {dinheiro(alvoSoMinhas)}</span>}</div>
          <button type="button" className="btn suave" onClick={() => novaMeta()}><Plus />Nova meta</button>
        </div>
        {soMinhas.length === 0 ? (
          <div className="vazio"><Target /><div>{temGrupo ? "Metas só suas (que o grupo não vê) aparecem aqui." : "Crie uma meta (viagem, reserva de emergência, um equipamento) e registre quanto vai guardando. O app mostra quanto falta por mês."}</div></div>
        ) : <div className="lista">{soMinhas.map((m) => <ItemMeta key={m.id} m={m} abrir={() => setAberta(m.id)} />)}</div>}
      </section>

      <MeuPixRodape />
      <Folha titulo="Seu grupo" aberta={grupoAberto} fechar={() => setGrupoAberto(false)}><SeuGrupo userId={meuId} /></Folha>
      {aberta && <DetalheMeta m={dados.metas.find((m) => m.id === aberta)!} fechar={() => setAberta(null)} editar={(m) => { setAberta(null); setEdit(m); }} />}
      {doGrupo && <DetalheMetaGrupo m={dosOutros.find((m) => `${m.espaco_id}:${m.id}` === doGrupo)} meuId={meuId} fechar={() => setDoGrupo(null)} />}
      <EditarMeta edit={edit} fechar={() => setEdit(null)} />
    </>
  );
}

/** Rodapé de Metas: para onde vão os seus depósitos por Pix, com atalho para trocar. */
function MeuPixRodape() {
  const [chave] = useChavePix();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn fantasma" style={{ justifySelf: "center", fontSize: ".84rem" }} onClick={() => setAberto(true)}>
        <QrCode size={16} />{chave ? `Seus depósitos vão para o seu Pix (${chave.chave.slice(0, 8)}…) · trocar` : "Cadastrar o seu Pix para depósitos"}
      </button>
      <Folha titulo="Meu Pix" aberta={aberto} fechar={() => setAberto(false)}><FormChavePix aoSalvar={() => setAberto(false)} /></Folha>
    </>
  );
}

/** Id do usuário logado (para saber quais aportes do grupo são meus). */
function useMeuId() {
  const [id, setId] = useState<string>();
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setId(data.session?.user.id)); }, []);
  return id;
}

function ItemMetaGrupo({ m, abrir }: { m: MetaGrupo; abrir: () => void }) {
  const total = { ...m, guardado: m.guardado + m.aportes.reduce((a, x) => a + x.valor, 0), aportes: [], criadoEm: "", prazo: m.prazo ?? undefined };
  const r = resumoMeta(total);
  const $ = useDinheiro();
  return (
    <button type="button" className="meta-item" onClick={abrir}>
      <div className="lin">
        <IconeCategoria icone={m.icone} cor={m.cor} />
        <div>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</div>
          <div className="muted num" style={{ fontSize: ".8rem" }}>{$(total.guardado)} / {$(m.alvo)} · de {primeiroNome(m.dono_nome)}</div>
        </div>
        <span className="pct num">{Math.round(r.pct)}%</span>
      </div>
      <div className="trilho-prog"><i style={{ width: `${r.pct}%`, background: m.cor }} /></div>
    </button>
  );
}

// ---------- Divisão do que cada um guardou (metas compartilhadas) ----------
type Parte = { userId: string; nome: string; valor: number };
const CORES_PESSOAS = ["#6c4ed8", "#2f8f83", "#c9771f", "#3d7be0"];

/** Quanto cada pessoa colocou numa meta compartilhada: o dono (guardado da meta) + aportes de cada um. */
function partesDaMeta(m: MetaGrupo, guardadoLocal?: number): Parte[] {
  const mapa = new Map<string, Parte>();
  const somar = (userId: string, nome: string, v: number) => {
    const p = mapa.get(userId) ?? { userId, nome, valor: 0 };
    p.valor += v; mapa.set(userId, p);
  };
  somar(m.dono_id, m.dono_nome, guardadoLocal ?? m.guardado);
  for (const a of m.aportes) somar(a.user_id, a.nome, a.valor);
  return [...mapa.values()].filter((p) => p.valor > 0);
}
function juntarPartes(listas: Parte[][]): Parte[] {
  const mapa = new Map<string, Parte>();
  for (const l of listas) for (const p of l) { const x = mapa.get(p.userId) ?? { ...p, valor: 0 }; x.valor += p.valor; mapa.set(p.userId, x); }
  return [...mapa.values()];
}
/** Você primeiro (na cor do tema), depois os outros. */
function corDe(partes: Parte[], meuId: string | undefined, corTema: string) {
  const ordem = [...partes].sort((a, b) => (a.userId === meuId ? -1 : b.userId === meuId ? 1 : a.nome.localeCompare(b.nome)));
  return { ordem, cor: (id: string) => (id === meuId ? corTema : CORES_PESSOAS[Math.max(0, ordem.filter((x) => x.userId !== meuId).findIndex((x) => x.userId === id)) % CORES_PESSOAS.length]) };
}

/** Barra da meta dividida por pessoa (cada um com sua cor) + legenda "Você R$ X · Rita R$ Y". */
function BarraDividida({ partes, alvo, meuId, corTema }: { partes: Parte[]; alvo: number; meuId?: string; corTema: string }) {
  const { ordem, cor } = corDe(partes, meuId, corTema);
  const total = partes.reduce((a, p) => a + p.valor, 0);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="trilho-prog" style={{ display: "flex", overflow: "hidden" }} role="img"
        aria-label={ordem.map((p) => `${p.userId === meuId ? "Você" : primeiroNome(p.nome)} ${dinheiro(p.valor)}`).join(", ")}>
        {ordem.map((p) => <i key={p.userId} style={{ position: "static", display: "block", height: "100%", width: `${alvo ? Math.min(100, (p.valor / alvo) * 100) : 0}%`, background: cor(p.userId), borderRadius: 0 }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: ".82rem" }}>
        {ordem.map((p) => (
          <span key={p.userId} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: cor(p.userId), display: "inline-block" }} />
            {p.userId === meuId ? "Você" : primeiroNome(p.nome)} <b className="num">{dinheiro(p.valor)}</b>
            {total > 0 && <span className="muted num">({Math.round((p.valor / total) * 100)}%)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Lista "quem guardou quanto" de uma meta compartilhada. */
function AportesDoGrupo({ aportes, meuId, podeRemoverTodos }: { aportes: MetaGrupo["aportes"]; meuId?: string; podeRemoverTodos?: boolean }) {
  const aviso = useAviso();
  if (!aportes.length) return null;
  const porPessoa = new Map<string, number>();
  for (const a of aportes) porPessoa.set(a.nome, (porPessoa.get(a.nome) ?? 0) + a.valor);
  return (
    <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
      <h2 style={{ fontSize: ".95rem" }}>Quem guardou junto</h2>
      {[...porPessoa.entries()].map(([nome, v]) => <div key={nome} className="cab" style={{ fontSize: ".88rem" }}><span>{primeiroNome(nome)}</span><b className="num pos">+{dinheiro(v)}</b></div>)}
      <details><summary className="muted" style={{ fontSize: ".84rem", cursor: "pointer" }}>Ver cada aporte</summary>
        {[...aportes].reverse().slice(0, 20).map((a) => (
          <div key={a.id} className="cab" style={{ fontSize: ".86rem" }}>
            <span className="muted">{dataCurta(a.data)} · {primeiroNome(a.nome)}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b className="num pos">+{dinheiro(a.valor)}</b>
              {(a.user_id === meuId || podeRemoverTodos) && <BotaoConfirmar className="btn fantasma" confirmar="Desfazer?" onConfirm={async () => {
                try { await removerAporteDoGrupo(a.id); aviso("Aporte desfeito."); } catch (e) { aviso(String((e as Error).message)); }
              }}>Desfazer</BotaoConfirmar>}
            </span>
          </div>
        ))}
      </details>
    </div>
  );
}

/** Meta de outra pessoa do grupo: ver o progresso e guardar junto. */
function DetalheMetaGrupo({ m, meuId, fechar }: { m?: MetaGrupo; meuId?: string; fechar: () => void }) {
  const aviso = useAviso();
  const [valor, setValor] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  const [pix, setPix] = useState<number | null>(null);
  const { grupos } = useGruposEstado();
  if (!m) return null;
  const tema = temaDe(grupos.find((g) => g.id === m.grupo_id)?.tipo);
  const somaGrupo = m.aportes.reduce((a, x) => a + x.valor, 0);
  const r = resumoMeta({ ...m, guardado: m.guardado + somaGrupo, aportes: [], criadoEm: "", prazo: m.prazo ?? undefined });
  async function guardar(valorPix?: number) {
    const v = valorPix ?? lerValor(valor) ?? 0;
    if (v <= 0) { aviso("Informe um valor."); return; }
    setTrabalhando(true);
    try {
      const antes = m!.guardado + somaGrupo;
      await guardarNaMetaDoGrupo(m!, v); setValor(""); setPix(null);
      celebrarDeposito({ valor: v, metaNome: m!.nome, antes, depois: antes + v, alvo: m!.alvo, cor: tema.cor, mensagem: mensagemDeCarinho(v, m!.nome, m!.alvo - antes - v) });
    }
    catch (e) { aviso(navigator.onLine ? String((e as Error).message) : "Sem internet agora: para guardar na meta do grupo é preciso estar conectado."); }
    finally { setTrabalhando(false); }
  }
  return (
    <Folha titulo={m.nome} aberta fechar={fechar}>
      <span className="muted" style={{ fontSize: ".86rem" }}>Meta de {primeiroNome(m.dono_nome)}, compartilhada com o grupo. {frase(tema.incentivos)}</span>
      <div className="bloco">
        <div className="cab"><span className="rotulo">Progresso</span><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.2rem" }}>{Math.round(r.pct)}%</b></div>
        <BarraDividida partes={partesDaMeta(m)} alvo={m.alvo} meuId={meuId} corTema={tema.cor} />
        <div className="cab"><span className="num">{dinheiro(m.guardado + somaGrupo)} de {dinheiro(m.alvo)}</span><span className="muted num">falta {dinheiro(r.falta)}</span></div>
        {r.porMes ? <span className="muted" style={{ fontSize: ".86rem" }}>Para chegar até {mesExtenso(m.prazo!)}: {dinheiro(r.porMes)} por mês, somando todo mundo.</span> : null}
      </div>
      <Campo rotulo="Quanto você vai depositar"><InputValor id="mg-valor" value={valor} onChange={(v) => { setValor(v); setPix(null); }} /></Campo>
      {pix ? <PainelPix valorCentavos={pix} mensagem={m.nome} aoPagar={() => guardar(pix)} aoCancelar={() => setPix(null)} /> : (
        <div className="linha-botoes">
          <button type="button" className="btn pri" onClick={() => { const v = lerValor(valor) ?? 0; if (v <= 0) aviso("Digite o valor do depósito."); else setPix(v); }}><QrCode />Depositar por Pix</button>
          <button type="button" className="btn" disabled={trabalhando} onClick={() => void guardar()}>{trabalhando ? "Guardando…" : "Já guardei"}</button>
        </div>
      )}
      <AportesDoGrupo aportes={m.aportes} meuId={meuId} />
    </Folha>
  );
}

function DetalheMeta({ m: original, fechar, editar }: { m: Meta; fechar: () => void; editar: (m: Meta) => void }) {
  const aviso = useAviso();
  const [valor, setValor] = useState("");
  const [pix, setPix] = useState<number | null>(null);
  const grupos = useGruposEstado();
  const meuId = useMeuId();
  const { tema } = useTemaAtivo(meuId);
  if (!original) return null;
  const m = original;
  const doGrupo = m.grupoId ? grupos.metas.find((x) => x.minha && x.id === m.id) : undefined;
  const nomeGrupo = m.grupoId ? grupos.grupos.find((g) => g.id === m.grupoId)?.nome : undefined;
  const somaGrupo = doGrupo ? doGrupo.aportes.reduce((a, x) => a + x.valor, 0) : 0;
  const r = resumoMeta({ ...m, guardado: m.guardado + somaGrupo });
  async function movimentar(sinal: 1 | -1, valorPix?: number) {
    const v = valorPix ?? lerValor(valor) ?? 0;
    if (v <= 0) { aviso("Informe um valor."); return; }
    const guardado = Math.max(0, m.guardado + sinal * v);
    await db.metas.update(m.id, { guardado, aportes: [...m.aportes, { data: hoje(), valor: sinal * v }] });
    setValor(""); setPix(null);
    if (sinal > 0 && (m.grupoId || valorPix)) {
      const antes = m.guardado + somaGrupo;
      celebrarDeposito({ valor: v, metaNome: m.nome, antes, depois: antes + v, alvo: m.alvo, cor: tema?.cor ?? m.cor, mensagem: mensagemDeCarinho(v, m.nome, m.alvo - antes - v) });
    } else aviso(sinal > 0 ? `${dinheiro(v)} guardados.` : `${dinheiro(v)} retirados.`);
  }
  return (
    <Folha titulo={m.nome} aberta fechar={fechar} acoes={<button type="button" className="btn" onClick={() => editar(m)}>Editar</button>}>
      {nomeGrupo && <span className="muted" style={{ fontSize: ".86rem" }}><Users size={14} style={{ verticalAlign: "-2px" }} /> Compartilhada com “{nomeGrupo}”: o grupo vê e guarda junto.</span>}
      <div className="bloco">
        <div className="cab"><span className="rotulo">Progresso</span><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.2rem" }}>{Math.round(r.pct)}%</b></div>
        {doGrupo ? <BarraDividida partes={partesDaMeta(doGrupo, m.guardado)} alvo={m.alvo} meuId={meuId} corTema={tema?.cor ?? m.cor} />
          : <div className="trilho-prog"><i style={{ width: `${r.pct}%`, background: m.cor }} /></div>}
        <div className="cab"><span className="num">{dinheiro(m.guardado + somaGrupo)} de {dinheiro(m.alvo)}</span><span className="muted num">falta {dinheiro(r.falta)}</span></div>
        {r.porMes ? <span className="muted" style={{ fontSize: ".86rem" }}>Para chegar até {mesExtenso(m.prazo!)}: guarde {dinheiro(r.porMes)} por mês.</span> : null}
      </div>
      <Campo rotulo="Valor"><InputValor id="mt-valor" value={valor} onChange={(v) => { setValor(v); setPix(null); }} /></Campo>
      {pix ? <PainelPix valorCentavos={pix} mensagem={m.nome} aoPagar={() => movimentar(1, pix)} aoCancelar={() => setPix(null)} /> : (
        <div className="linha-botoes">
          <button type="button" className="btn pri" onClick={() => { const v = lerValor(valor) ?? 0; if (v <= 0) aviso("Digite o valor do depósito."); else setPix(v); }}><QrCode />Depositar por Pix</button>
          <button type="button" className="btn" onClick={() => movimentar(1)}>Já guardei</button>
          <button type="button" className="btn fantasma" onClick={() => movimentar(-1)}>Retirar</button>
        </div>
      )}
      {doGrupo && <AportesDoGrupo aportes={doGrupo.aportes} meuId={meuId} podeRemoverTodos />}
      {m.aportes.length > 0 && (
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <h2 style={{ fontSize: ".95rem" }}>{doGrupo ? "Seus aportes" : "Histórico"}</h2>
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
  const { grupos } = useGruposEstado();
  const { tema } = useTemaAtivo();
  const [form, setForm] = useState<Partial<Meta> & { alvoTxt?: string; guardadoTxt?: string }>({});
  const [carregado, setCarregado] = useState<Partial<Meta> | null>(null);
  if (edit !== carregado) {
    setCarregado(edit);
    setForm(edit ? { ...edit, alvoTxt: edit.alvo ? numeroBR(edit.alvo) : "", guardadoTxt: edit.guardado ? numeroBR(edit.guardado) : "" } : {});
  }
  if (!edit) return null;
  const sugestoes = !edit.id && tema ? tema.sugestoesMeta : [];
  async function salvar() {
    const alvo = lerValor(form.alvoTxt ?? "") ?? 0;
    if (!form.nome?.trim()) { aviso("Dê um nome à meta."); return; }
    if (alvo <= 0) { aviso("Informe o valor da meta."); return; }
    const guardado = lerValor(form.guardadoTxt ?? "") ?? 0;
    const existente = edit?.id ? await db.metas.get(edit.id) : undefined;
    await db.metas.put({
      id: edit?.id ?? novoId(), nome: form.nome.trim(), alvo, guardado, prazo: form.prazo || undefined,
      icone: form.icone ?? "piggy", cor: form.cor ?? CORES[0], aportes: existente?.aportes ?? (guardado ? [{ data: hoje(), valor: guardado }] : []),
      criadoEm: existente?.criadoEm ?? new Date().toISOString(), grupoId: form.grupoId || undefined,
    });
    aviso("Meta salva."); fechar();
  }
  return (
    <Folha titulo={edit.id ? "Editar meta" : "Nova meta"} aberta fechar={fechar}>
      <Campo rotulo="Nome"><input id="me-nome" value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Reserva de emergência" maxLength={60} /></Campo>
      {sugestoes.length > 0 && !form.nome && <div className="linha-botoes">{sugestoes.map((n) => <button key={n} type="button" className="chip" onClick={() => setForm({ ...form, nome: n, grupoId: form.grupoId ?? grupos[0]?.id })}>{n}</button>)}</div>}
      <div className="duas">
        <Campo rotulo="Quanto quer juntar"><InputValor id="me-alvo" value={form.alvoTxt ?? ""} onChange={(v) => setForm({ ...form, alvoTxt: v })} /></Campo>
        <Campo rotulo="Já tem guardado"><InputValor id="me-guard" value={form.guardadoTxt ?? ""} onChange={(v) => setForm({ ...form, guardadoTxt: v })} /></Campo>
      </div>
      <div className="campo"><span>Até quando (opcional)</span><CampoMesOpcional valor={form.prazo ?? ""} mudar={(m) => setForm({ ...form, prazo: m && m < mesAtual() ? mesAtual() : m })} /></div>
      {grupos.length > 0 && (
        <label className="campo"><span>Compartilhar com</span>
          <select value={form.grupoId ?? ""} onChange={(e) => setForm({ ...form, grupoId: e.target.value || undefined })}>
            <option value="">Só eu</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome} ({temaDe(g.tipo).rotulo}): vê e guarda junto</option>)}
          </select>
        </label>
      )}
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
