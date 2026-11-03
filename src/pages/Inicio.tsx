import { useMemo } from "react";
import { AlertTriangle, CalendarCheck, Check, ChevronRight, CreditCard, Lightbulb, MessageSquareText, PieChart, ScanLine, Target } from "lucide-react";
import { ehCartao, type Lancamento, type Perfil } from "../db";
import { hoje, mesAtual, saldosContas, situacao, somarDias, totais } from "../lib/calc";
import { dinheiro, mesExtenso } from "../lib/format";
import { OBJETIVOS, dicaDoDia } from "../lib/perfil";
import { ItemLancamento } from "../components/ItemLancamento";
import { useConfig, type DadosApp } from "../components/ui";
import { MiniCartao, situacaoCartao } from "./Cartoes";
import { ItemMeta } from "./Metas";

export type Progresso = { contas?: boolean; relatorio?: boolean; backup?: boolean; oculto?: boolean };
export type Destino = "transacoes" | "relatorios" | "pessoas" | "cartoes" | "metas" | "fechamento" | "contas" | "backup" | "perfil";

export function Inicio({ dados, perfil, abrir, novo, lerConta, perguntar, ir }: {
  dados: DadosApp; perfil: Perfil; abrir: (l: Lancamento) => void; novo: () => void; lerConta: () => void; perguntar: () => void; ir: (d: Destino) => void;
}) {
  const [prog, setProg] = useConfig<Progresso>("progresso", {});
  const h = hoje(), mes = mesAtual();
  const contas = dados.contas.filter((c) => !ehCartao(c));
  const cartoes = dados.contas.filter(ehCartao);
  const saldo = [...saldosContas(contas, dados.lanc, h).values()].reduce((a, b) => a + b, 0);
  const doMes = dados.lanc.filter((l) => l.data.startsWith(mes));
  const t = totais(doMes);
  const faturas = cartoes.reduce((a, c) => a + situacaoCartao(c, dados.lanc).usado, 0);
  const atrasados = dados.lanc.filter((l) => situacao(l, h) === "atrasado").sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data));
  const em7 = somarDias(h, 7);
  const proximos = dados.lanc.filter((l) => l.status === "pendente" && (l.vencimento ?? l.data) >= h && (l.vencimento ?? l.data) <= em7)
    .sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data));
  const ultimas = [...dados.lanc].filter((l) => l.data <= h).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm)).slice(0, 5);
  const dica = useMemo(() => dicaDoDia(perfil, dados.lanc), [perfil, dados.lanc]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of doMes) if (l.tipo === "despesa" && l.status === "pago") m.set(l.categoriaId ?? "-", (m.get(l.categoriaId ?? "-") ?? 0) + l.valor);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => {
      const c = dados.cats.find((x) => x.id === id);
      return { nome: c?.nome ?? "Sem categoria", cor: c?.cor ?? "#6e7391", v };
    });
  }, [doMes, dados.cats]);
  const maxCat = Math.max(1, ...porCategoria.map((c) => c.v));

  const passos = [
    { feito: dados.lanc.length > 0, titulo: "Registre sua primeira transação", sub: "Um gasto de hoje ou uma conta que vai vencer.", acao: novo },
    { feito: !!prog.contas, titulo: "Confira suas contas e saldos", sub: perfil.uso === "empresa" ? "Banco da empresa e caixa." : "Conta corrente, carteira, poupança.", acao: () => ir("contas") },
    { feito: cartoes.length > 0, titulo: "Cadastre um cartão de crédito", sub: "Fatura, limite e vencimento num lugar só.", acao: () => ir("cartoes") },
    { feito: dados.metas.length > 0, titulo: "Crie uma meta", sub: "Reserva, viagem ou um equipamento.", acao: () => ir("metas") },
    { feito: !!prog.backup, titulo: "Guarde um backup", sub: "Uma cópia extra em arquivo, além da nuvem.", acao: () => ir("backup") },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  const mostrarPassos = !prog.oculto && feitos < passos.length;
  const aVencer = [...atrasados.slice(0, 3), ...proximos];

  return (
    <>
      <div className="kpis" data-tour="extrato">
        <div className="kpi-card principal"><span className="rotulo">Saldo total</span><span className="v num">{dinheiro(saldo)}</span></div>
        <div className="kpi-card"><span className="rotulo">Receitas</span><span className="v num pos">{dinheiro(t.entradas)}</span></div>
        <div className="kpi-card"><span className="rotulo">Despesas</span><span className="v num neg">{dinheiro(t.saidas)}</span></div>
        <div className="kpi-card"><span className="rotulo">Faturas</span><span className="v num">{dinheiro(faturas)}</span></div>
      </div>

      <div className="atalhos">
        <button type="button" className="btn" onClick={lerConta}><span className="bolha"><ScanLine size={18} /></span>Ler conta pela foto</button>
        <button type="button" className="btn" onClick={perguntar}><span className="bolha"><MessageSquareText size={18} /></span>Perguntar sobre os números</button>
        <button type="button" className="btn" onClick={() => ir("fechamento")}><span className="bolha"><CalendarCheck size={18} /></span>Fechar o mês</button>
      </div>

      <div className="grade-dash">
        {mostrarPassos && (
          <section className="card largo" data-tour="passos">
            <div className="cab">
              <div><h2>Primeiros passos</h2><span className="muted" style={{ fontSize: ".82rem" }}>{feitos} de {passos.length} concluídos</span></div>
              <button type="button" className="btn fantasma" onClick={() => setProg({ ...prog, oculto: true })}>Ocultar</button>
            </div>
            <div className="trilho-prog"><i style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
            <div className="passos">
              {passos.map((p) => (
                <button key={p.titulo} type="button" className={`passo ${p.feito ? "feito" : ""}`} onClick={p.acao}>
                  <span className="marca-passo">{p.feito && <Check size={14} strokeWidth={3} />}</span>
                  <span><span className="tt">{p.titulo}</span><small>{p.sub}</small></span>
                  <ChevronRight size={18} className="muted" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="cab"><h2>Gastos por categoria</h2><span className="chip">{mesExtenso(mes).split(" ")[0]}</span></div>
          {porCategoria.length ? (
            <div className="barras">
              {porCategoria.map((c) => (
                <div className="barra" key={c.nome}>
                  <span className="ponto" style={{ background: c.cor }} />
                  <span className="nm">{c.nome}</span>
                  <span className="trilho"><i style={{ width: `${(c.v / maxCat) * 100}%`, background: c.cor }} /></span>
                  <span className="num">{dinheiro(c.v)}</span>
                </div>
              ))}
            </div>
          ) : <div className="vazio"><PieChart /><div>As despesas pagas do mês aparecem aqui, separadas por categoria.</div></div>}
        </section>

        <section className="card">
          <div className="cab"><h2>Últimas transações</h2><button type="button" className="btn fantasma" onClick={() => ir("transacoes")}>Ver todas</button></div>
          {ultimas.length ? <div className="lista">{ultimas.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
            : <div className="vazio"><div>Nenhuma transação ainda. Toque em <b>Lançar</b> para registrar a primeira.</div></div>}
        </section>

        <MetaDoMes perfil={perfil} entradas={t.entradas} saidas={t.saidas} resultado={t.resultado} ir={ir} />

        <section className="card">
          <div className="cab"><h2>Contas a vencer</h2><span className="chip">7 dias</span></div>
          {atrasados.length > 0 && (
            <div className="aviso neg"><AlertTriangle /><div><b>{atrasados.length === 1 ? "1 conta atrasada" : `${atrasados.length} contas atrasadas`}</b> · {dinheiro(atrasados.reduce((a, l) => a + l.valor, 0))}</div></div>
          )}
          {aVencer.length ? <div className="lista">{aVencer.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
            : <p className="muted">Nada vencendo nesta semana.</p>}
        </section>

        <section className="card">
          <div className="cab"><h2>Cartões ativos</h2><button type="button" className="btn fantasma" onClick={() => ir("cartoes")}>{cartoes.length ? "Ver" : "Adicionar"}</button></div>
          {cartoes.length ? (
            <div className="lista">
              {cartoes.slice(0, 3).map((c) => {
                const s = situacaoCartao(c, dados.lanc);
                return (
                  <button key={c.id} type="button" className="cartao" onClick={() => ir("cartoes")}>
                    <MiniCartao c={c} />
                    <div><span className="nm">{c.nome}</span>{c.limite ? <div className="trilho-prog"><i style={{ width: `${s.pct}%`, background: c.cor }} /></div> : <span className="det">Sem limite cadastrado</span>}</div>
                    <b className="num fat">{dinheiro(s.usado)}</b>
                  </button>
                );
              })}
            </div>
          ) : <div className="vazio"><CreditCard /><div>Acompanhe fatura e limite dos seus cartões.</div></div>}
        </section>

        <section className="card">
          <div className="cab"><h2>Metas em andamento</h2><button type="button" className="btn fantasma" onClick={() => ir("metas")}>{dados.metas.length ? "Ver" : "Criar"}</button></div>
          {dados.metas.length ? <div className="lista">{dados.metas.slice(0, 3).map((m) => <ItemMeta key={m.id} m={m} abrir={() => ir("metas")} />)}</div>
            : <div className="vazio"><Target /><div>Defina um objetivo e acompanhe o progresso.</div></div>}
        </section>

        <section className="aviso dica largo">
          <Lightbulb />
          <div><b>Dica para {OBJETIVOS[perfil.objetivo].titulo.toLowerCase()}</b><p className="muted" style={{ marginTop: 2 }}>{dica}</p></div>
        </section>
      </div>
    </>
  );
}

function MetaDoMes({ perfil, entradas, saidas, resultado, ir }: { perfil: Perfil; entradas: number; saidas: number; resultado: number; ir: (d: "perfil") => void }) {
  const o = OBJETIVOS[perfil.objetivo];
  if (!o.meta) {
    const valor = perfil.objetivo === "crescer" ? entradas : saidas;
    return (
      <section className="card">
        <div><h2>Seu foco</h2><span className="muted" style={{ fontSize: ".84rem" }}>{o.titulo}</span></div>
        <div className="cab"><span className="muted">{perfil.objetivo === "crescer" ? "Receitas do mês" : "Despesas do mês"}</span><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.3rem", fontWeight: 600 }}>{dinheiro(valor)}</b></div>
        <span className="muted" style={{ fontSize: ".86rem" }}>Resultado do mês: <b className={resultado >= 0 ? "pos" : "neg"}>{dinheiro(resultado)}</b></span>
      </section>
    );
  }
  const economizar = perfil.objetivo === "economizar";
  if (!perfil.meta) {
    return (
      <section className="card">
        <div className="cab"><h2>{economizar ? "Meta de sobra do mês" : "Limite de gastos"}</h2></div>
        <div className="cab"><span className="muted">{economizar ? "Defina quanto quer guardar por mês." : "Defina um limite de gastos por mês."}</span><button type="button" className="btn suave" onClick={() => ir("perfil")}>Definir</button></div>
      </section>
    );
  }
  const atual = economizar ? Math.max(0, resultado) : saidas;
  const pct = Math.min(100, (atual / perfil.meta) * 100);
  const estourou = !economizar && saidas > perfil.meta;
  const texto = economizar
    ? resultado >= perfil.meta ? "Meta do mês batida." : `Faltam ${dinheiro(perfil.meta - Math.max(0, resultado))} para a meta.`
    : estourou ? `Passou ${dinheiro(saidas - perfil.meta)} do limite.` : `Ainda cabem ${dinheiro(perfil.meta - saidas)} no limite.`;
  return (
    <section className="card">
      <div className="cab"><h2>{economizar ? "Meta de sobra do mês" : "Limite de gastos"}</h2><button type="button" className="btn fantasma" onClick={() => ir("perfil")}>Ajustar</button></div>
      <div className="cab"><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.45rem", fontWeight: 600 }}>{dinheiro(atual)}</b><span className="muted num">de {dinheiro(perfil.meta)}</span></div>
      <div className={`trilho-prog ${estourou ? "estourou" : ""}`}><i style={{ width: `${pct}%` }} /></div>
      <span className={estourou ? "neg" : "muted"} style={{ fontSize: ".86rem" }}>{texto}</span>
    </section>
  );
}
