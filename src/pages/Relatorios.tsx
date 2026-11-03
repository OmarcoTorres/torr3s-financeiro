import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Save, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, novoId, type Agrupar, type Coluna, type ConfigRelatorio } from "../db";
import { fimDoMes, mesAtual, saldoPessoa, totais, ultimosMeses } from "../lib/calc";
import { dataBR, dinheiro, mesCurto, mesExtenso } from "../lib/format";
import { montarTabela, NOME_COLUNA, TODAS_COLUNAS, type Tabela } from "../lib/relatorio";
import { exportarCSV, exportarPDF } from "../lib/exportar";
import { BotaoConfirmar, Campo, useAviso, useConfig, type DadosApp } from "../components/ui";

type Aba = "fluxo" | "categorias" | "abertos" | "pessoas" | "comparativo" | "personalizado";
const ABAS: [Aba, string][] = [
  ["fluxo", "Fluxo de caixa"], ["categorias", "Despesas por categoria"], ["abertos", "A pagar e a receber"],
  ["pessoas", "Saldo por pessoa"], ["comparativo", "Mês a mês"], ["personalizado", "Personalizado"],
];

const novoConfig = (): ConfigRelatorio => ({ de: `${mesAtual()}-01`, ate: fimDoMes(mesAtual()), agrupar: "nenhum", colunas: ["data", "descricao", "categoria", "pessoa", "status", "valor"] });

export function Relatorios({ dados }: { dados: DadosApp }) {
  const aviso = useAviso();
  const [empresa] = useConfig("empresa", "Invest+");
  const [aba, setAba] = useState<Aba>("fluxo");
  const [mes, setMes] = useState(mesAtual());
  const [meses, setMeses] = useState(6);
  const [cfg, setCfg] = useState<ConfigRelatorio>(novoConfig);
  const [nomeSalvar, setNomeSalvar] = useState("");
  const salvos = useLiveQuery(() => db.relatorios.toArray(), []) ?? [];

  const base = { lanc: dados.lanc, cats: dados.cats, contas: dados.contas, pessoas: dados.pessoas };

  const { titulo, subtitulo, tabela, colunasGrafico } = useMemo(() => {
    const ini = (m: string) => `${m}-01`;
    switch (aba) {
      case "fluxo": {
        const ms = ultimosMeses(meses, mes);
        const linhas = ms.map((m) => {
          const t = totais(dados.lanc.filter((l) => l.data.startsWith(m)));
          return { m, ...t };
        });
        let acumulado = 0;
        const tab: Tabela = {
          cabecalho: ["Mês", "Entradas", "Saídas", "Resultado", "Acumulado"],
          linhas: linhas.map((x) => { acumulado += x.resultado; return [mesCurto(x.m), dinheiro(x.entradas), dinheiro(x.saidas), dinheiro(x.resultado), dinheiro(acumulado)]; }),
          numericas: [1, 2, 3, 4],
          total: ["Total", dinheiro(linhas.reduce((a, x) => a + x.entradas, 0)), dinheiro(linhas.reduce((a, x) => a + x.saidas, 0)), dinheiro(acumulado), ""],
        };
        return { titulo: "Fluxo de caixa", subtitulo: `${mesCurto(ms[0])} a ${mesCurto(ms[ms.length - 1])} · só lançamentos pagos`, tabela: tab, colunasGrafico: linhas.map((x) => ({ rotulo: mesCurto(x.m), ent: x.entradas, sai: x.saidas })) };
      }
      case "categorias": {
        const c: ConfigRelatorio = { de: ini(mes), ate: fimDoMes(mes), tipo: "despesa", status: "pago", agrupar: "categoria", colunas: [] };
        return { titulo: "Despesas por categoria", subtitulo: `${mesExtenso(mes)} · pagas`, tabela: montarTabela(c, base), colunasGrafico: undefined };
      }
      case "abertos": {
        const c: ConfigRelatorio = { de: "0000-01-01", ate: fimDoMes(mes), status: "aberto", agrupar: "nenhum", colunas: ["vencimento", "descricao", "tipo", "pessoa", "status", "valor"] };
        const t = montarTabela(c, base);
        const ab = dados.lanc.filter((l) => l.status === "pendente" && l.data <= fimDoMes(mes));
        const rec = ab.filter((l) => l.tipo === "receita").reduce((a, l) => a + l.valor, 0);
        const pag = ab.filter((l) => l.tipo === "despesa").reduce((a, l) => a + l.valor, 0);
        return { titulo: "A pagar e a receber", subtitulo: `Em aberto até ${dataBR(fimDoMes(mes))} · a receber ${dinheiro(rec)} · a pagar ${dinheiro(pag)}`, tabela: t, colunasGrafico: undefined };
      }
      case "pessoas": {
        const ls = dados.pessoas.map((p) => ({ p, s: saldoPessoa(p, dados.lanc) })).sort((a, b) => Math.abs(b.s.liquido) - Math.abs(a.s.liquido));
        const tab: Tabela = {
          cabecalho: ["Pessoa", "Tipo", "A receber dela", "A pagar a ela", "Saldo líquido", "Parte em divisões"],
          linhas: ls.map(({ p, s }) => [p.nome, p.tipo, dinheiro(s.aReceber), dinheiro(s.aPagar), dinheiro(s.liquido), dinheiro(s.parteDividida)]),
          numericas: [2, 3, 4, 5],
          total: ["Total", "", dinheiro(ls.reduce((a, x) => a + x.s.aReceber, 0)), dinheiro(ls.reduce((a, x) => a + x.s.aPagar, 0)), dinheiro(ls.reduce((a, x) => a + x.s.liquido, 0)), ""],
        };
        return { titulo: "Saldo por pessoa", subtitulo: "Valores pendentes hoje", tabela: tab, colunasGrafico: undefined };
      }
      case "comparativo": {
        const ms = ultimosMeses(3, mes);
        const cats = dados.cats.filter((c) => c.tipo === "despesa");
        const val = (catId: string | undefined, m: string) => dados.lanc.filter((l) => l.tipo === "despesa" && l.status === "pago" && l.categoriaId === catId && l.data.startsWith(m)).reduce((a, l) => a + l.valor, 0);
        const linhas = [...cats.map((c) => ({ nome: c.nome, v: ms.map((m) => val(c.id, m)) })), { nome: "Sem categoria", v: ms.map((m) => val(undefined, m)) }]
          .filter((x) => x.v.some(Boolean));
        const varPct = (a: number, b: number) => (a ? `${(((b - a) / a) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%` : b ? "novo" : "—");
        const tab: Tabela = {
          cabecalho: ["Categoria", ...ms.map(mesCurto), "Variação"],
          linhas: linhas.map((x) => [x.nome, ...x.v.map(dinheiro), varPct(x.v[1], x.v[2])]),
          numericas: [1, 2, 3, 4],
          total: ["Total", ...ms.map((_, i) => dinheiro(linhas.reduce((a, x) => a + x.v[i], 0))), ""],
        };
        return { titulo: "Despesas mês a mês", subtitulo: `${mesCurto(ms[0])} a ${mesCurto(ms[2])} · variação do último mês sobre o anterior`, tabela: tab, colunasGrafico: undefined };
      }
      default:
        return { titulo: nomeSalvar.trim() || "Relatório personalizado", subtitulo: `${dataBR(cfg.de)} a ${dataBR(cfg.ate)}`, tabela: montarTabela(cfg, base), colunasGrafico: undefined };
    }
  }, [aba, mes, meses, cfg, dados, nomeSalvar]);

  const mudar = (p: Partial<ConfigRelatorio>) => setCfg((c) => ({ ...c, ...p }));
  const alternarColuna = (col: Coluna) => mudar({ colunas: cfg.colunas.includes(col) ? cfg.colunas.filter((x) => x !== col) : TODAS_COLUNAS.filter((x) => x === col || cfg.colunas.includes(x)) });

  async function salvar() {
    const nome = nomeSalvar.trim();
    if (!nome) { aviso("Dê um nome ao relatório."); return; }
    const existente = salvos.find((s) => s.nome.toLowerCase() === nome.toLowerCase());
    await db.relatorios.put({ id: existente?.id ?? novoId(), nome, config: cfg });
    aviso(existente ? "Relatório atualizado." : "Relatório salvo.");
  }

  const max = Math.max(1, ...(tabela.grafico ?? []).map((g) => Math.abs(g.valor)));
  const maxCol = Math.max(1, ...(colunasGrafico ?? []).flatMap((c) => [c.ent, c.sai]));

  return (
    <>
      <div className="abas" role="group" aria-label="Relatórios">
        {ABAS.map(([k, n]) => <button key={k} type="button" aria-pressed={aba === k} onClick={() => setAba(k)}>{n}</button>)}
      </div>

      {aba !== "personalizado" && aba !== "pessoas" && (
        <div className="filtros">
          <Campo rotulo={aba === "fluxo" || aba === "comparativo" ? "Até o mês" : "Mês"}><input id="rel-mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></Campo>
          {aba === "fluxo" && <Campo rotulo="Meses"><select id="rel-n" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>{[3, 6, 12].map((n) => <option key={n} value={n}>{n} meses</option>)}</select></Campo>}
        </div>
      )}

      {aba === "personalizado" && (
        <section className="card">
          <h2>Monte o relatório</h2>
          {salvos.length > 0 && (
            <div className="abas" role="group" aria-label="Relatórios salvos">
              {salvos.map((s) => <button key={s.id} type="button" aria-pressed={nomeSalvar === s.nome} onClick={() => { setCfg(s.config); setNomeSalvar(s.nome); }}>{s.nome}</button>)}
            </div>
          )}
          <div className="filtros">
            <Campo rotulo="De"><input id="p-de" type="date" value={cfg.de} onChange={(e) => mudar({ de: e.target.value })} /></Campo>
            <Campo rotulo="Até"><input id="p-ate" type="date" value={cfg.ate} onChange={(e) => mudar({ ate: e.target.value })} /></Campo>
            <Campo rotulo="Tipo"><select id="p-tipo" value={cfg.tipo ?? ""} onChange={(e) => mudar({ tipo: e.target.value as ConfigRelatorio["tipo"] })}><option value="">Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option><option value="transferencia">Transferências</option></select></Campo>
            <Campo rotulo="Situação"><select id="p-sit" value={cfg.status ?? ""} onChange={(e) => mudar({ status: e.target.value as ConfigRelatorio["status"] })}><option value="">Todas</option><option value="pago">Pago</option><option value="aberto">Em aberto</option><option value="atrasado">Atrasado</option></select></Campo>
            <Campo rotulo="Categoria"><select id="p-cat" value={cfg.categoriaId ?? ""} onChange={(e) => mudar({ categoriaId: e.target.value })}><option value="">Todas</option>{dados.cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
            <Campo rotulo="Conta"><select id="p-conta" value={cfg.contaId ?? ""} onChange={(e) => mudar({ contaId: e.target.value })}><option value="">Todas</option>{dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
            <Campo rotulo="Pessoa"><select id="p-pessoa" value={cfg.pessoaId ?? ""} onChange={(e) => mudar({ pessoaId: e.target.value })}><option value="">Todas</option>{dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
            <Campo rotulo="Agrupar por"><select id="p-agr" value={cfg.agrupar} onChange={(e) => mudar({ agrupar: e.target.value as Agrupar })}><option value="nenhum">Não agrupar (lista)</option><option value="categoria">Categoria</option><option value="pessoa">Pessoa</option><option value="conta">Conta</option><option value="mes">Mês</option></select></Campo>
          </div>
          {cfg.agrupar === "nenhum" && (
            <div className="campo"><span>Colunas</span>
              <div className="abas" style={{ flexWrap: "wrap" }}>{TODAS_COLUNAS.map((c) => <button key={c} type="button" aria-pressed={cfg.colunas.includes(c)} onClick={() => alternarColuna(c)}>{NOME_COLUNA[c]}</button>)}</div>
            </div>
          )}
          <div className="busca">
            <input className="btn" style={{ fontWeight: 500, justifyContent: "flex-start" }} placeholder="Nome para salvar, ex.: Combustível do trimestre" value={nomeSalvar} onChange={(e) => setNomeSalvar(e.target.value)} aria-label="Nome do relatório" id="p-nome" />
            <button type="button" className="btn pri" onClick={salvar}><Save />Salvar</button>
          </div>
          <div className="linha-botoes">
            <button type="button" className="btn fantasma" onClick={() => { setCfg(novoConfig()); setNomeSalvar(""); }}>Começar do zero</button>
            {salvos.some((s) => s.nome === nomeSalvar) && (
              <BotaoConfirmar confirmar="Toque de novo para excluir" onConfirm={async () => { const s = salvos.find((x) => x.nome === nomeSalvar); if (s) await db.relatorios.delete(s.id); setNomeSalvar(""); aviso("Relatório excluído."); }}><Trash2 />Excluir salvo</BotaoConfirmar>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <div className="cab" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div><h2>{titulo}</h2><div className="muted" style={{ fontSize: ".82rem" }}>{subtitulo}</div></div>
          <div className="linha-botoes">
            <button type="button" className="btn" onClick={() => exportarCSV(titulo, tabela)}><FileSpreadsheet />CSV</button>
            <button type="button" className="btn" onClick={() => exportarPDF(titulo, subtitulo, empresa, tabela)}><FileDown />PDF</button>
          </div>
        </div>

        {colunasGrafico && (
          <>
            <div className="colunas" role="img" aria-label="Entradas e saídas por mês">
              {colunasGrafico.map((c) => (
                <div className="c" key={c.rotulo}>
                  <div className="par">
                    <i style={{ height: `${(c.ent / maxCol) * 100}%`, background: "var(--pos)" }} title={`Entradas ${dinheiro(c.ent)}`} />
                    <i style={{ height: `${(c.sai / maxCol) * 100}%`, background: "var(--neg)" }} title={`Saídas ${dinheiro(c.sai)}`} />
                  </div>
                  <div className="rot">{c.rotulo}</div>
                </div>
              ))}
            </div>
            <div className="legenda"><span><b style={{ background: "var(--pos)" }} />Entradas</span><span><b style={{ background: "var(--neg)" }} />Saídas</span></div>
          </>
        )}
        {tabela.grafico && tabela.grafico.length > 0 && (
          <div className="barras">
            {tabela.grafico.slice(0, 12).map((g) => (
              <div className="barra" key={g.rotulo}>
                <span className="nm">{g.rotulo}</span>
                <span className="trilho"><i style={{ width: `${(Math.abs(g.valor) / max) * 100}%`, background: g.cor ?? (g.valor < 0 ? "var(--neg)" : "var(--accent)") }} /></span>
                <span className="num" style={{ fontWeight: 700 }}>{dinheiro(g.valor)}</span>
              </div>
            ))}
          </div>
        )}

        {tabela.linhas.length ? (
          <div className="tabela">
            <table>
              <thead><tr>{tabela.cabecalho.map((h, i) => <th key={i} className={tabela.numericas.includes(i) ? "n" : ""}>{h}</th>)}</tr></thead>
              <tbody>{tabela.linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className={tabela.numericas.includes(j) ? "n" : ""}>{c}</td>)}</tr>)}</tbody>
              {tabela.total && <tfoot><tr>{tabela.total.map((c, j) => <td key={j} className={tabela.numericas.includes(j) ? "n" : ""}>{c}</td>)}</tr></tfoot>}
            </table>
          </div>
        ) : <div className="vazio">Nada para mostrar neste período.</div>}
      </section>
    </>
  );
}

