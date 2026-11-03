import { useMemo } from "react";
import { AlertTriangle, CalendarCheck, Check, ChevronRight, Info, Lightbulb, MessageSquareText, ScanLine } from "lucide-react";
import type { Lancamento, Perfil } from "../db";
import { removerExemplos } from "../db";
import { fimDoMes, hoje, mesAtual, saldosContas, situacao, somarDias, totais } from "../lib/calc";
import { dinheiro } from "../lib/format";
import { OBJETIVOS, dicaDoDia } from "../lib/perfil";
import { ItemLancamento } from "../components/ItemLancamento";
import { BotaoConfirmar, useAviso, useConfig, type DadosApp } from "../components/ui";

export type Progresso = { contas?: boolean; relatorio?: boolean; backup?: boolean; oculto?: boolean };

export function Inicio({ dados, perfil, abrir, novo, lerConta, perguntar, ir }: {
  dados: DadosApp; perfil: Perfil; abrir: (l: Lancamento) => void; novo: () => void; lerConta: () => void; perguntar: () => void;
  ir: (destino: "lancamentos" | "relatorios" | "pessoas" | "fechamento" | "contas" | "backup" | "perfil") => void;
}) {
  const aviso = useAviso();
  const [prog, setProg] = useConfig<Progresso>("progresso", {});
  const h = hoje(), mes = mesAtual();
  const saldo = [...saldosContas(dados.contas, dados.lanc, h).values()].reduce((a, b) => a + b, 0);
  const t = totais(dados.lanc.filter((l) => l.data.startsWith(mes)));
  const atrasados = dados.lanc.filter((l) => situacao(l, h) === "atrasado").sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data));
  const em7 = somarDias(h, 7);
  const proximos = dados.lanc.filter((l) => l.status === "pendente" && (l.vencimento ?? l.data) >= h && (l.vencimento ?? l.data) <= em7)
    .sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data));
  const temExemplo = dados.lanc.some((l) => l.exemplo) || dados.pessoas.some((p) => p.exemplo);
  const somaAtras = atrasados.reduce((a, l) => a + l.valor, 0);
  const dica = useMemo(() => dicaDoDia(perfil, dados.lanc), [perfil, dados.lanc]);

  const passos = [
    { feito: dados.lanc.some((l) => !l.exemplo), titulo: "Faça seu primeiro lançamento", sub: "Um gasto de hoje ou uma conta que vai vencer.", acao: novo },
    { feito: !!prog.contas, titulo: "Confira suas contas e saldos", sub: perfil.uso === "empresa" ? "Banco da empresa, caixa, cartão." : "Conta corrente, carteira, poupança.", acao: () => ir("contas") },
    { feito: dados.pessoas.some((p) => !p.exemplo), titulo: perfil.uso === "empresa" ? "Cadastre um cliente ou fornecedor" : "Cadastre alguém com quem você divide contas", sub: "Para saber quem deve a quem.", acao: () => ir("pessoas") },
    { feito: !!prog.relatorio, titulo: "Abra um relatório", sub: "Fluxo de caixa e despesas por categoria.", acao: () => ir("relatorios") },
    { feito: !!prog.backup, titulo: "Guarde um backup", sub: "Os dados ficam no aparelho; o backup é sua cópia.", acao: () => ir("backup") },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  const mostrarPassos = !prog.oculto && feitos < passos.length;

  return (
    <>
      {temExemplo && (
        <div className="aviso warn"><Info /><div>
          Você está vendo <b>lançamentos de exemplo</b>. Quando quiser começar de verdade, remova-os.
          <div className="linha-botoes">
            <BotaoConfirmar className="btn" confirmar="Toque de novo para remover" onConfirm={async () => { await removerExemplos(); aviso("Exemplos removidos."); }}>Remover exemplos</BotaoConfirmar>
          </div>
        </div></div>
      )}

      <section className="card extrato" aria-label="Saldo" data-tour="extrato">
        <div className="rot">Saldo em todas as contas · {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</div>
        <div className="grande num">{dinheiro(saldo)}</div>
        <Grafico dados={dados} mes={mes} h={h} />
        <div className="linha-extrato">
          <div className="kpi"><span className="k">Entrou no mês</span><span className="v num">{dinheiro(t.entradas)}</span></div>
          <div className="kpi"><span className="k">Saiu</span><span className="v num">{dinheiro(t.saidas)}</span></div>
          <div className="kpi"><span className="k">Sobrou</span><span className="v num">{dinheiro(t.resultado)}</span></div>
        </div>
      </section>

      <Meta perfil={perfil} entradas={t.entradas} saidas={t.saidas} resultado={t.resultado} ir={ir} />

      <div className="atalhos">
        <button type="button" className="btn" onClick={lerConta}><span className="bolha"><ScanLine size={18} /></span>Ler conta pela foto</button>
        <button type="button" className="btn" onClick={perguntar}><span className="bolha"><MessageSquareText size={18} /></span>Perguntar sobre os números</button>
        <button type="button" className="btn" onClick={() => ir("fechamento")}><span className="bolha"><CalendarCheck size={18} /></span>Fechar o mês</button>
      </div>

      {mostrarPassos && (
        <section className="card" data-tour="passos">
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

      {atrasados.length > 0 && (
        <section className="card" style={{ borderColor: "color-mix(in srgb, var(--neg) 45%, var(--line))" }}>
          <div className="cab"><h2 className="neg" style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={18} />{atrasados.length === 1 ? "1 conta atrasada" : `${atrasados.length} contas atrasadas`}</h2><span className="num neg" style={{ fontWeight: 800 }}>{dinheiro(somaAtras)}</span></div>
          <div className="lista">{atrasados.slice(0, 6).map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
        </section>
      )}

      <section className="card">
        <div className="cab"><h2>Vence nos próximos 7 dias</h2>{proximos.length > 0 && <button type="button" className="btn fantasma" onClick={() => ir("lancamentos")}>Ver tudo</button>}</div>
        {proximos.length ? (
          <div className="lista">{proximos.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
        ) : <p className="muted">Nada vencendo nesta semana.</p>}
      </section>

      <section className="aviso" style={{ background: "var(--accent-soft)" }}>
        <Lightbulb style={{ color: "var(--accent)" }} />
        <div><b>Dica para {OBJETIVOS[perfil.objetivo].titulo.toLowerCase()}</b><p className="muted" style={{ marginTop: 2 }}>{dica}</p></div>
      </section>
    </>
  );
}

function Meta({ perfil, entradas, saidas, resultado, ir }: { perfil: Perfil; entradas: number; saidas: number; resultado: number; ir: (d: "perfil") => void }) {
  const o = OBJETIVOS[perfil.objetivo];
  if (!o.meta) {
    const valor = perfil.objetivo === "crescer" ? entradas : saidas;
    return (
      <section className="card" style={{ gap: 6 }}>
        <span className="rotulo">Seu foco · {o.titulo}</span>
        <div className="cab"><span>{perfil.objetivo === "crescer" ? "Entradas do mês" : "Saídas do mês"}</span><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.15rem" }}>{dinheiro(valor)}</b></div>
      </section>
    );
  }
  const economizar = perfil.objetivo === "economizar";
  if (!perfil.meta) {
    return (
      <section className="card" style={{ gap: 8 }}>
        <span className="rotulo">Seu foco · {o.titulo}</span>
        <div className="cab"><span>{economizar ? "Defina quanto quer guardar por mês." : "Defina um limite de gastos por mês."}</span><button type="button" className="btn" onClick={() => ir("perfil")}>Definir</button></div>
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
    <section className="card" style={{ gap: 8 }}>
      <div className="cab"><span className="rotulo">{economizar ? "Meta de sobra do mês" : "Limite de gastos do mês"}</span><button type="button" className="btn fantasma" onClick={() => ir("perfil")}>Ajustar</button></div>
      <div className="cab"><b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.3rem" }}>{dinheiro(atual)}</b><span className="muted num">de {dinheiro(perfil.meta)}</span></div>
      <div className={`trilho-prog ${estourou ? "estourou" : ""}`}><i style={{ width: `${pct}%` }} /></div>
      <span className={estourou ? "neg" : "muted"} style={{ fontSize: ".86rem" }}>{texto}</span>
    </section>
  );
}

function Grafico({ dados, mes, h }: { dados: DadosApp; mes: string; h: string }) {
  const pontos = useMemo(() => {
    const fim = fimDoMes(mes);
    const ultimoDia = Number((h < fim ? h : fim).slice(8, 10));
    let acc = [...saldosContas(dados.contas, dados.lanc, somarDias(`${mes}-01`, -1)).values()].reduce((a, b) => a + b, 0);
    const pts: number[] = [acc];
    for (let d = 1; d <= ultimoDia; d++) {
      const dia = `${mes}-${String(d).padStart(2, "0")}`;
      for (const l of dados.lanc) if (l.data === dia && l.status === "pago") acc += l.tipo === "receita" ? l.valor : l.tipo === "despesa" ? -l.valor : 0;
      pts.push(acc);
    }
    return pts;
  }, [dados.lanc, dados.contas, mes, h]);
  if (pontos.length < 3 || Math.min(...pontos) === Math.max(...pontos)) return null;
  const W = 300, H = 56;
  const min = Math.min(...pontos), max = Math.max(...pontos), amp = max - min || 1;
  const xy = pontos.map((v, i) => [(i / (pontos.length - 1)) * W, max === min ? H / 2 : H - 4 - ((v - min) / amp) * (H - 8)]);
  const linha = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ux, uy] = xy[xy.length - 1];
  return (
    <svg className="grafico" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Evolução do saldo no mês" style={{ overflow: "visible" }}>
      <path d={`${linha} L${W},${H} L0,${H} Z`} fill="currentColor" opacity=".14" />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r="3.5" fill="currentColor" />
    </svg>
  );
}
