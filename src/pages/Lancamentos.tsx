import { useMemo, useState } from "react";
import { ListFilter, Search, Users } from "lucide-react";
import type { Lancamento } from "../db";
import { mesAtual, situacao, somarMeses, totais, fimDoMes } from "../lib/calc";
import { dataBR, dinheiro } from "../lib/format";
import { ItemCompartilhado, ItemLancamento } from "../components/ItemLancamento";
import { Campo, Seg, type DadosApp } from "../components/ui";
import { CampoData } from "../components/campos";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function Lancamentos({ dados, abrir }: { dados: DadosApp; abrir: (l: Lancamento) => void }) {
  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<"minhas" | "grupo">("minhas");
  const [filtros, setFiltros] = useState(false);
  const [de, setDe] = useState(`${somarMeses(`${mesAtual()}-01`, -1).slice(0, 7)}-01`);
  const [ate, setAte] = useState(fimDoMes(somarMeses(`${mesAtual()}-01`, 2).slice(0, 7)));
  const [tipo, setTipo] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [contaId, setContaId] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  const [sit, setSit] = useState("");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const pes = new Map(dados.pessoas.map((p) => [p.id, p.nome.toLowerCase()]));
    return dados.lanc.filter((l) =>
      l.data >= de && l.data <= ate &&
      (!tipo || l.tipo === tipo) && (!categoriaId || l.categoriaId === categoriaId) &&
      (!contaId || l.contaId === contaId || l.contaDestinoId === contaId) && (!pessoaId || l.pessoaId === pessoaId) &&
      (!sit || situacao(l) === sit) &&
      (!q || l.descricao.toLowerCase().includes(q) || (l.observacao ?? "").toLowerCase().includes(q) || (pes.get(l.pessoaId ?? "") ?? "").includes(q)),
    ).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  }, [dados.lanc, dados.pessoas, busca, de, ate, tipo, categoriaId, contaId, pessoaId, sit]);

  const porDia = useMemo(() => {
    const m = new Map<string, Lancamento[]>();
    for (const l of lista) m.set(l.data, [...(m.get(l.data) ?? []), l]);
    return [...m.entries()];
  }, [lista]);
  const t = totais(lista);
  const ativos = [tipo, categoriaId, contaId, pessoaId, sit].filter(Boolean).length;

  const temGrupo = dados.compartilhados.length > 0 || dados.pessoas.some((p) => p.userId);
  if (visao === "grupo") {
    const q = busca.trim().toLowerCase();
    const comp = dados.compartilhados.filter((c) => !q || c.descricao.toLowerCase().includes(q) || c.autorNome.toLowerCase().includes(q))
      .sort((a, b) => b.data.localeCompare(a.data));
    return (
      <>
        <Seg rotulo="Ver" valor={visao} mudar={setVisao} opcoes={[["minhas", "Minhas"], ["grupo", "Do grupo"]]} />
        <input className="entrada" type="search" placeholder="Buscar no que o grupo compartilhou" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar compartilhados" id="busca-grupo" />
        <section className="card" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: ".82rem" }}>{comp.length} lançamento(s) compartilhado(s) com você · só quem lançou pode editar</span>
          {comp.length ? <div className="lista">{comp.map((c) => <ItemCompartilhado key={c.id} c={c} mostrarData />)}</div>
            : <div className="vazio"><Users /><div>Nada compartilhado com você ainda. Quando alguém do seu grupo marcar um lançamento como compartilhado, ele aparece aqui.</div></div>}
        </section>
      </>
    );
  }

  return (
    <>
      {temGrupo && <Seg rotulo="Ver" valor={visao} mudar={setVisao} opcoes={[["minhas", "Minhas"], ["grupo", "Do grupo"]]} />}
      <div className="busca">
        <label className="campo" style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: 14, color: "var(--muted)" }} aria-hidden />
          <input id="busca" type="search" placeholder="Buscar descrição, pessoa ou observação" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ paddingLeft: 38 }} aria-label="Buscar lançamentos" />
        </label>
        <button type="button" className="btn" aria-expanded={filtros} onClick={() => setFiltros(!filtros)}><ListFilter />Filtros{ativos ? ` (${ativos})` : ""}</button>
      </div>

      {filtros && (
        <section className="card filtros">
          <div className="campo"><span>De</span><CampoData id="fl-de" valor={de} mudar={(v) => v && setDe(v)} obrigatoria /></div>
          <div className="campo"><span>Até</span><CampoData id="fl-ate" valor={ate} mudar={(v) => v && setAte(v)} obrigatoria /></div>
          <Campo rotulo="Tipo"><select id="fl-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option><option value="transferencia">Transferências</option></select></Campo>
          <Campo rotulo="Situação"><select id="fl-sit" value={sit} onChange={(e) => setSit(e.target.value)}><option value="">Todas</option><option value="pago">Pago</option><option value="pendente">Pendente</option><option value="atrasado">Atrasado</option></select></Campo>
          <Campo rotulo="Categoria"><select id="fl-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">Todas</option>{dados.cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo rotulo="Conta"><select id="fl-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}><option value="">Todas</option>{dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo rotulo="Pessoa"><select id="fl-pessoa" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}><option value="">Todas</option>{dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
          <div style={{ alignSelf: "end" }}><button type="button" className="btn fantasma" onClick={() => { setTipo(""); setCategoriaId(""); setContaId(""); setPessoaId(""); setSit(""); }}>Limpar filtros</button></div>
        </section>
      )}

      <section className="card" style={{ gap: 6 }}>
        <div className="cab" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: ".82rem" }}>{lista.length} {lista.length === 1 ? "lançamento" : "lançamentos"}<br />{dataBR(de)} a {dataBR(ate)}</span>
          <span className="num" style={{ fontSize: ".82rem", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}><span className="pos">+{dinheiro(t.entradas)}</span><br /><span className="neg">−{dinheiro(t.saidas)}</span></span>
        </div>
        {porDia.length === 0 ? (
          <div className="vazio"><Search /><div>Nenhum lançamento com esses filtros.</div></div>
        ) : porDia.map(([dia, ls]) => {
          const [a, m, d] = dia.split("-").map(Number);
          return (
            <div key={dia}>
              <div className="dia">{DIAS[new Date(a, m - 1, d).getDay()]}, {dataBR(dia)}</div>
              <div className="lista">{ls.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} />)}</div>
            </div>
          );
        })}
      </section>
    </>
  );
}
