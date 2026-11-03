import { useEffect, useState } from "react";
import { CalendarCheck, ChevronRight, Database, GraduationCap, Lock, LockOpen, Palette, Tags, UserRound, Wallet } from "lucide-react";
import { db, novoId, type Categoria, type Conta, type Objetivo, type Perfil } from "../db";
import { OBJETIVOS } from "../lib/perfil";
import { mesAtual, resumoMes, somarMeses } from "../lib/calc";
import { dataCurta, dinheiro, lerValor, mesExtenso, numeroBR } from "../lib/format";
import { apagarTudo, exportarBackup, importarBackup } from "../lib/backup";
import { BotaoConfirmar, CORES, Campo, Folha, ICONES, IconeCategoria, Seg, marcarProgresso, useAviso, useConfig, type DadosApp } from "../components/ui";

export type Secao = "" | "perfil" | "fechamento" | "categorias" | "contas" | "aparencia" | "backup";

export function Mais({ dados, secao, setSecao, refazerTour }: { dados: DadosApp; secao: Secao; setSecao: (s: Secao) => void; refazerTour: () => void }) {
  const fechar = () => setSecao("");
  useEffect(() => { if (secao === "contas") marcarProgresso("contas"); }, [secao]);
  const itens: [Secao, typeof Wallet, string, string][] = [
    ["perfil", UserRound, "Seu perfil e objetivo", "Nome, idade, objetivo e meta do mês"],
    ["fechamento", CalendarCheck, "Fechamento mensal", "Saldo do mês, pendências e fechar/reabrir"],
    ["categorias", Tags, "Categorias", "Nomes, cores, ícones e subcategorias"],
    ["contas", Wallet, "Contas e carteiras", "Bancos, caixa e saldo inicial"],
    ["aparencia", Palette, "Aparência e empresa", "Nome, logo, cor e tema"],
    ["backup", Database, "Backup e dados", "Exportar, importar e apagar"],
  ];
  return (
    <>
      <section className="card">
        <div className="menu-lista">
          {itens.map(([k, I, t, d]) => (
            <button key={k} type="button" onClick={() => setSecao(k)}><I aria-hidden /><span>{t}<small>{d}</small></span><ChevronRight aria-hidden /></button>
          ))}
        </div>
      </section>
            <section className="card" style={{ gap: 8 }}>
        <h2>Treinamento</h2>
        <p className="muted" style={{ fontSize: ".9rem" }}>Reveja o tour guiado que mostra onde fica cada coisa.</p>
        <div><button type="button" className="btn" onClick={refazerTour}><GraduationCap />Refazer o tour</button></div>
      </section>
      <Folha titulo="Seu perfil e objetivo" aberta={secao === "perfil"} fechar={fechar}><EditarPerfil fechar={fechar} /></Folha>
      <Folha titulo="Fechamento mensal" aberta={secao === "fechamento"} fechar={fechar}><Fechamento dados={dados} /></Folha>
      <Folha titulo="Categorias" aberta={secao === "categorias"} fechar={fechar}><Categorias dados={dados} /></Folha>
      <Folha titulo="Contas e carteiras" aberta={secao === "contas"} fechar={fechar}><Contas dados={dados} /></Folha>
      <Folha titulo="Aparência e empresa" aberta={secao === "aparencia"} fechar={fechar}><Aparencia /></Folha>
      <Folha titulo="Backup e dados" aberta={secao === "backup"} fechar={fechar}><Backup /></Folha>
    </>
  );
}

function Fechamento({ dados }: { dados: DadosApp }) {
  const aviso = useAviso();
  const [mes, setMes] = useState(mesAtual());
  const r = resumoMes(mes, dados.contas, dados.lanc);
  const fechado = dados.fech.find((f) => f.mes === mes);
  async function fechar() {
    await db.fechamentos.put({ mes, fechadoEm: new Date().toISOString(), resumo: { saldoInicial: r.saldoInicial, entradas: r.entradas, saidas: r.saidas, saldoFinal: r.saldoFinal, pendencias: r.pendencias.length } });
    aviso(`${mesExtenso(mes)} fechado.`);
  }
  async function reabrir() { await db.fechamentos.delete(mes); aviso(`${mesExtenso(mes)} reaberto.`); }
  return (
    <>
      <div className="busca" style={{ gridTemplateColumns: "auto 1fr auto" }}>
        <button type="button" className="btn icone" aria-label="Mês anterior" onClick={() => setMes(somarMeses(`${mes}-01`, -1).slice(0, 7))}>‹</button>
        <input type="month" className="btn" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Mês" id="fe-mes" />
        <button type="button" className="btn icone" aria-label="Próximo mês" onClick={() => setMes(somarMeses(`${mes}-01`, 1).slice(0, 7))}>›</button>
      </div>
      {fechado && <div className="aviso warn"><Lock /><div>Mês fechado em {dataCurta(fechado.fechadoEm.slice(0, 10))}. Os lançamentos deste mês não podem ser editados até reabrir.</div></div>}
      <div className="grade">
        <div className="card kpi"><span className="k">Saldo inicial</span><span className="v num">{dinheiro(r.saldoInicial)}</span></div>
        <div className="card kpi"><span className="k">Entradas</span><span className="v num pos">{dinheiro(r.entradas)}</span></div>
        <div className="card kpi"><span className="k">Saídas</span><span className="v num neg">{dinheiro(r.saidas)}</span></div>
        <div className="card kpi"><span className="k">Saldo final</span><span className="v num">{dinheiro(r.saldoFinal)}</span></div>
      </div>
      <div className="tabela">
        <table>
          <thead><tr><th>Conta</th><th className="n">Início</th><th className="n">Fim</th></tr></thead>
          <tbody>{r.porConta.map((c) => <tr key={c.conta.id}><td>{c.conta.nome}</td><td className="n">{dinheiro(c.inicial)}</td><td className="n">{dinheiro(c.final)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h2>Pendências até o fim do mês ({r.pendencias.length})</h2>
        {r.pendencias.length ? r.pendencias.slice(0, 30).map((l) => (
          <div key={l.id} className="cab" style={{ fontSize: ".88rem" }}>
            <span>{dataCurta(l.vencimento ?? l.data)} · {l.descricao}{r.atrasadas.includes(l) ? " · atrasado" : ""}</span>
            <b className={`num ${l.tipo === "receita" ? "pos" : "neg"}`}>{dinheiro(l.valor)}</b>
          </div>
        )) : <p className="muted" style={{ margin: 0 }}>Nenhuma pendência.</p>}
      </div>
      {fechado ? (
        <BotaoConfirmar className="btn" confirmar="Toque de novo para reabrir" onConfirm={reabrir}><LockOpen />Reabrir mês</BotaoConfirmar>
      ) : (
        <>
          {r.pendencias.length > 0 && <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Você pode fechar com pendências; elas continuam em aberto e aparecem nos próximos meses.</p>}
          <BotaoConfirmar className="btn pri" confirmar={`Confirmar fechamento de ${mesExtenso(mes)}`} onConfirm={fechar}><Lock />Fechar mês</BotaoConfirmar>
        </>
      )}
      {dados.fech.length > 0 && (
        <div className="card">
          <h2>Meses fechados</h2>
          {[...dados.fech].sort((a, b) => b.mes.localeCompare(a.mes)).map((f) => (
            <button key={f.mes} type="button" className="cab btn fantasma" style={{ justifyContent: "space-between", width: "100%" }} onClick={() => setMes(f.mes)}>
              <span>{mesExtenso(f.mes)}</span><span className="num">{dinheiro(f.resumo.saldoFinal)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Categorias({ dados }: { dados: DadosApp }) {
  const aviso = useAviso();
  const [tipo, setTipo] = useState<"despesa" | "receita">("despesa");
  const [edit, setEdit] = useState<Partial<Categoria> | null>(null);
  const doTipo = dados.cats.filter((c) => c.tipo === tipo);
  const pais = doTipo.filter((c) => !c.paiId).sort((a, b) => a.nome.localeCompare(b.nome));

  async function salvar() {
    if (!edit?.nome?.trim()) { aviso("Escreva o nome."); return; }
    await db.categorias.put({ id: edit.id ?? novoId(), nome: edit.nome.trim(), tipo, cor: edit.cor ?? CORES[0], icone: edit.icone ?? "tag", paiId: edit.paiId || undefined });
    aviso("Categoria salva."); setEdit(null);
  }
  async function excluir() {
    if (!edit?.id) return;
    const id = edit.id;
    await db.transaction("rw", db.categorias, db.lancamentos, async () => {
      await db.lancamentos.where("categoriaId").equals(id).modify((l) => { delete l.categoriaId; });
      await db.categorias.where("paiId").equals(id).modify((c) => { delete c.paiId; });
      await db.categorias.delete(id);
    });
    aviso("Categoria excluída."); setEdit(null);
  }

  if (edit) {
    const usos = edit.id ? dados.lanc.filter((l) => l.categoriaId === edit.id).length : 0;
    return (
      <>
        <Campo rotulo="Nome"><input id="ca-nome" value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} maxLength={60} /></Campo>
        <Campo rotulo="Subcategoria de">
          <select id="ca-pai" value={edit.paiId ?? ""} onChange={(e) => setEdit({ ...edit, paiId: e.target.value })}>
            <option value="">Nenhuma (categoria principal)</option>
            {pais.filter((p) => p.id !== edit.id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <div className="campo"><span>Cor</span><div className="cores">{CORES.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={(edit.cor ?? CORES[0]) === c} style={{ background: c }} onClick={() => setEdit({ ...edit, cor: c })} />)}</div></div>
        <div className="campo"><span>Ícone</span>
          <div className="cores">{Object.entries(ICONES).map(([k, I]) => (
            <button key={k} type="button" aria-label={`Ícone ${k}`} aria-pressed={(edit.icone ?? "tag") === k} onClick={() => setEdit({ ...edit, icone: k })}
              style={{ background: (edit.icone ?? "tag") === k ? edit.cor ?? CORES[0] : "var(--surface-2)", color: (edit.icone ?? "tag") === k ? "#fff" : "var(--ink)", display: "grid", placeItems: "center", width: 40, height: 40 }}><I size={18} /></button>
          ))}</div>
        </div>
        <div className="linha-botoes" style={{ justifyContent: "space-between" }}>
          <div className="linha-botoes">
            <button type="button" className="btn" onClick={() => setEdit(null)}>Voltar</button>
            {edit.id && <BotaoConfirmar confirmar={usos ? `Excluir? ${usos} lançamento(s) ficam sem categoria` : "Toque de novo para excluir"} onConfirm={excluir}>Excluir</BotaoConfirmar>}
          </div>
          <button type="button" className="btn pri" onClick={salvar}>Salvar</button>
        </div>
      </>
    );
  }
  return (
    <>
      <Seg rotulo="Tipo" valor={tipo} mudar={setTipo} opcoes={[["despesa", "Despesas"], ["receita", "Receitas"]]} />
      <div className="lista">
        {pais.map((p) => (
          <div key={p.id}>
            <button type="button" className="item" style={{ gridTemplateColumns: "38px 1fr" }} onClick={() => setEdit(p)}><IconeCategoria icone={p.icone} cor={p.cor} /><div className="tt">{p.nome}</div></button>
            {doTipo.filter((s) => s.paiId === p.id).map((s) => (
              <button key={s.id} type="button" className="item" style={{ gridTemplateColumns: "38px 1fr", paddingLeft: 28 }} onClick={() => setEdit(s)}><IconeCategoria icone={s.icone} cor={s.cor} /><div className="tt">{s.nome}</div></button>
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="btn pri" onClick={() => setEdit({ tipo, cor: CORES[Math.floor(Math.random() * CORES.length)], icone: "tag" })}>Nova categoria</button>
    </>
  );
}

function Contas({ dados }: { dados: DadosApp }) {
  const aviso = useAviso();
  const [edit, setEdit] = useState<(Partial<Conta> & { saldoTxt?: string }) | null>(null);
  async function salvar() {
    if (!edit?.nome?.trim()) { aviso("Escreva o nome."); return; }
    await db.contas.put({ id: edit.id ?? novoId(), nome: edit.nome.trim(), saldoInicial: lerValor(edit.saldoTxt ?? "0") ?? 0, cor: edit.cor ?? CORES[0] });
    aviso("Conta salva."); setEdit(null);
  }
  async function excluir() {
    if (!edit?.id) return;
    await db.contas.delete(edit.id);
    aviso("Conta excluída."); setEdit(null);
  }
  if (edit) {
    const usos = edit.id ? dados.lanc.filter((l) => l.contaId === edit.id || l.contaDestinoId === edit.id).length : 0;
    return (
      <>
        <Campo rotulo="Nome"><input id="co-nome" value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} placeholder="Ex.: Banco do Brasil" /></Campo>
        <Campo rotulo="Saldo inicial (R$)"><input id="co-saldo" inputMode="decimal" value={edit.saldoTxt ?? ""} onChange={(e) => setEdit({ ...edit, saldoTxt: e.target.value })} placeholder="0,00" /></Campo>
        <div className="campo"><span>Cor</span><div className="cores">{CORES.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={(edit.cor ?? CORES[0]) === c} style={{ background: c }} onClick={() => setEdit({ ...edit, cor: c })} />)}</div></div>
        <div className="linha-botoes" style={{ justifyContent: "space-between" }}>
          <div className="linha-botoes">
            <button type="button" className="btn" onClick={() => setEdit(null)}>Voltar</button>
            {edit.id && (usos
              ? <span className="muted" style={{ fontSize: ".82rem", alignSelf: "center" }}>Tem {usos} lançamento(s); não pode ser excluída.</span>
              : <BotaoConfirmar confirmar="Toque de novo para excluir" onConfirm={excluir}>Excluir</BotaoConfirmar>)}
          </div>
          <button type="button" className="btn pri" onClick={salvar}>Salvar</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="lista">
        {dados.contas.map((c) => (
          <button key={c.id} type="button" className="item" style={{ gridTemplateColumns: "38px 1fr auto" }} onClick={() => setEdit({ ...c, saldoTxt: numeroBR(c.saldoInicial) })}>
            <span className="ic" style={{ background: c.cor }}><Wallet size={18} /></span>
            <div className="tt">{c.nome}</div>
            <span className="muted num" style={{ fontSize: ".82rem" }}>inicial {dinheiro(c.saldoInicial)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn pri" onClick={() => setEdit({ cor: CORES[2], saldoTxt: "" })}>Nova conta</button>
    </>
  );
}

function Aparencia() {
  const aviso = useAviso();
  const [empresa, setEmpresa] = useConfig("empresa", "");
  const [logo, setLogo] = useConfig<string>("logo", "");
  const [cor, setCor] = useConfig("cor", "#b8681c");
  const [tema, setTema] = useConfig<"sistema" | "claro" | "escuro">("tema", "sistema");
  const [nome, setNome] = useState(empresa);
  useEffect(() => { setNome(empresa); }, [empresa]);

  async function lerLogo(f: File) {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    await setLogo(c.toDataURL("image/png"));
    aviso("Logo atualizada.");
  }
  return (
    <>
      <Campo rotulo="Nome exibido no topo e nos relatórios"><input id="ap-nome" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={() => nome.trim() && setEmpresa(nome.trim())} maxLength={60} /></Campo>
      <div className="campo"><span>Logo</span>
        <div className="linha-botoes" style={{ alignItems: "center" }}>
          {logo && <img src={logo} alt="Logo atual" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />}
          <label className="btn">Escolher imagem<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && lerLogo(e.target.files[0])} /></label>
          {logo && <button type="button" className="btn fantasma" onClick={() => setLogo("")}>Remover</button>}
        </div>
      </div>
      <div className="campo"><span>Cor de destaque</span>
        <div className="cores">
          {CORES.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={cor === c} style={{ background: c }} onClick={() => setCor(c)} />)}
          <label className="btn" style={{ minHeight: 32, padding: "0 10px" }}>Outra<input type="color" value={cor} onChange={(e) => setCor(e.target.value)} style={{ width: 0, height: 0, opacity: 0, border: 0, padding: 0 }} /></label>
        </div>
      </div>
      <div className="campo"><span>Tema</span><Seg rotulo="Tema" valor={tema} mudar={setTema} opcoes={[["sistema", "Automático"], ["claro", "Claro"], ["escuro", "Escuro"]]} /></div>
      <button type="button" className="btn pri" onClick={async () => { if (nome.trim()) await setEmpresa(nome.trim()); aviso("Aparência salva."); }}>Salvar</button>
    </>
  );
}

function Backup() {
  const aviso = useAviso();
  const [erro, setErro] = useState("");
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>Tudo fica guardado só neste aparelho. Se o navegador for limpo ou o celular trocado, os dados somem; por isso, exporte um backup com frequência e guarde o arquivo (iCloud Drive, Google Drive, e-mail).</p>
      <button type="button" className="btn pri" onClick={async () => { await exportarBackup(); await marcarProgresso("backup"); aviso("Backup exportado."); }}>Exportar backup (arquivo)</button>
      <label className="btn">Importar backup
        <input type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return; setErro("");
          try { const n = await importarBackup(f); aviso(`Backup importado: ${n} lançamento(s).`); } catch (er) { setErro((er as Error).message); }
          e.target.value = "";
        }} />
      </label>
      <p className="muted" style={{ margin: 0, fontSize: ".82rem" }}>Importar substitui todos os dados atuais pelos do arquivo.</p>
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
      <BotaoConfirmar confirmar="Toque de novo: apaga tudo para sempre" onConfirm={async () => { await apagarTudo(); aviso("Todos os dados foram apagados."); }}>Apagar todos os dados</BotaoConfirmar>
    </>
  );
}

function EditarPerfil({ fechar }: { fechar: () => void }) {
  const aviso = useAviso();
  const [perfil, setPerfil] = useConfig<Perfil | null>("perfil", null);
  const [, setEmpresaCfg] = useConfig("empresa", "");
  const [nome, setNome] = useState("");
  const [idade, setIdade] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [objetivo, setObjetivo] = useState<Objetivo>("organizar");
  const [metaTxt, setMetaTxt] = useState("");
  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome); setIdade(perfil.idade ? String(perfil.idade) : ""); setEmpresa(perfil.empresa ?? "");
    setObjetivo(perfil.objetivo); setMetaTxt(perfil.meta ? numeroBR(perfil.meta) : "");
  }, [perfil]);
  if (!perfil) return null;
  const meta = OBJETIVOS[objetivo].meta;
  async function salvar() {
    if (!perfil || nome.trim().length < 2) { aviso("Escreva o seu nome."); return; }
    const novo: Perfil = { ...perfil, nome: nome.trim(), idade: idade ? Number(idade) : undefined, empresa: perfil.uso === "empresa" ? empresa.trim() || perfil.empresa : undefined, objetivo, meta: meta ? lerValor(metaTxt) ?? undefined : undefined };
    await setPerfil(novo);
    await setEmpresaCfg(novo.uso === "empresa" && novo.empresa ? novo.empresa : novo.nome);
    aviso("Perfil atualizado."); fechar();
  }
  return (
    <>
      <div className="duas">
        <Campo rotulo="Nome"><input id="pf-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} /></Campo>
        <Campo rotulo="Idade"><input id="pf-idade" inputMode="numeric" value={idade} onChange={(e) => setIdade(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Campo>
      </div>
      {perfil.uso === "empresa" && <Campo rotulo="Empresa"><input id="pf-emp" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={60} /></Campo>}
      <Campo rotulo="Objetivo agora">
        <select id="pf-obj" value={objetivo} onChange={(e) => setObjetivo(e.target.value as Objetivo)}>
          {(Object.keys(OBJETIVOS) as Objetivo[]).map((k) => <option key={k} value={k}>{OBJETIVOS[k].titulo}</option>)}
        </select>
      </Campo>
      <p className="muted" style={{ fontSize: ".86rem", marginTop: -6 }}>{OBJETIVOS[objetivo].descricao[perfil.uso]}</p>
      {meta && <Campo rotulo={meta.rotulo}><input id="pf-meta" inputMode="decimal" placeholder="R$ 0,00" value={metaTxt} onChange={(e) => setMetaTxt(e.target.value)} /></Campo>}
      <p className="muted" style={{ fontSize: ".82rem" }}>Uso: {perfil.uso === "empresa" ? "empresa" : "pessoal"}. Para trocar, apague os dados em Backup e dados e comece de novo.</p>
      <button type="button" className="btn pri" onClick={salvar}>Salvar</button>
    </>
  );
}
