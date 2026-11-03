import { useMemo } from "react";
import { AlertTriangle, CalendarCheck, MessageCircle, ScanText, Sparkles } from "lucide-react";
import type { Lancamento } from "../db";
import { removerExemplos } from "../db";
import { fimDoMes, hoje, mesAtual, saldosContas, situacao, somarDias, totais } from "../lib/calc";
import { dinheiro, mesExtenso } from "../lib/format";
import { ItemLancamento } from "../components/ItemLancamento";
import { BotaoConfirmar, useAviso, type DadosApp } from "../components/ui";

export function Inicio({ dados, abrir, lerConta, assistente, irFechamento }: {
  dados: DadosApp; abrir: (l: Lancamento) => void; lerConta: () => void; assistente: () => void; irFechamento: () => void;
}) {
  const aviso = useAviso();
  const h = hoje(), mes = mesAtual();
  const saldo = [...saldosContas(dados.contas, dados.lanc, h).values()].reduce((a, b) => a + b, 0);
  const doMes = dados.lanc.filter((l) => l.data.startsWith(mes));
  const t = totais(doMes);
  const atrasados = dados.lanc.filter((l) => situacao(l, h) === "atrasado").sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data));
  const em7 = somarDias(h, 7);
  const proximos = dados.lanc.filter((l) => l.status === "pendente" && (l.vencimento ?? l.data) >= h && (l.vencimento ?? l.data) <= em7)
    .sort((a, b) => (a.vencimento ?? a.data).localeCompare(b.vencimento ?? b.data));
  const temExemplo = dados.lanc.some((l) => l.exemplo) || dados.pessoas.some((p) => p.exemplo);
  const somaAtras = atrasados.reduce((a, l) => a + (l.tipo === "despesa" ? -l.valor : l.tipo === "receita" ? l.valor : 0), 0);

  // Saldo dia a dia no mês (pagos), para o gráfico.
  const serie = useMemo(() => {
    const fim = fimDoMes(mes);
    const ultimoDia = h < fim ? Number(h.slice(8, 10)) : Number(fim.slice(8, 10));
    let acumulado = [...saldosContas(dados.contas, dados.lanc, somarDias(`${mes}-01`, -1)).values()].reduce((a, b) => a + b, 0);
    const pts: number[] = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const dia = `${mes}-${String(d).padStart(2, "0")}`;
      for (const l of dados.lanc) if (l.data === dia && l.status === "pago") acumulado += l.tipo === "receita" ? l.valor : l.tipo === "despesa" ? -l.valor : 0;
      pts.push(acumulado);
    }
    return pts;
  }, [dados.lanc, dados.contas, mes, h]);

  return (
    <>
      {temExemplo && (
        <div className="aviso warn"><Sparkles /><div>
          O app abriu com <b>dados de exemplo</b> para você ver como funciona.
          <div className="linha-botoes">
            <BotaoConfirmar className="btn" confirmar="Toque de novo para remover" onConfirm={async () => { await removerExemplos(); aviso("Exemplos removidos."); }}>Remover exemplos</BotaoConfirmar>
          </div>
        </div></div>
      )}

      <section className="card destaque" aria-label="Saldo">
        <div className="rot">Saldo em todas as contas hoje</div>
        <div className="grande num">{dinheiro(saldo)}</div>
        <div className="grade">
          <div className="kpi"><span className="k">Entradas em {mesExtenso(mes).split(" ")[0]}</span><span className="v num">{dinheiro(t.entradas)}</span></div>
          <div className="kpi"><span className="k">Saídas em {mesExtenso(mes).split(" ")[0]}</span><span className="v num">{dinheiro(t.saidas)}</span></div>
          <div className="kpi"><span className="k">Resultado do mês</span><span className="v num">{dinheiro(t.resultado)}</span></div>
        </div>
        <Grafico pontos={serie} />
      </section>

      <div className="atalhos">
        <button type="button" className="btn" onClick={lerConta}><ScanText />Ler conta</button>
        <button type="button" className="btn" onClick={assistente}><MessageCircle />Assistente</button>
        <button type="button" className="btn" onClick={irFechamento}><CalendarCheck />Fechamento</button>
      </div>

      {atrasados.length > 0 && (
        <section className="card" style={{ borderColor: "color-mix(in srgb, var(--neg) 45%, var(--line))" }}>
          <div className="cab"><h2 className="neg" style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={18} />{atrasados.length} atrasado(s)</h2><span className="num neg" style={{ fontWeight: 800 }}>{dinheiro(Math.abs(somaAtras))}</span></div>
          <div className="lista">{atrasados.slice(0, 6).map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
        </section>
      )}

      <section className="card">
        <div className="cab"><h2>Vencem nos próximos 7 dias</h2></div>
        {proximos.length ? (
          <div className="lista">{proximos.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
        ) : <p className="muted" style={{ margin: 0 }}>Nada vencendo nesta semana.</p>}
      </section>
    </>
  );
}

function Grafico({ pontos }: { pontos: number[] }) {
  if (pontos.length < 3) return null;
  const W = 300, H = 70;
  const min = Math.min(...pontos), max = Math.max(...pontos);
  const amp = max - min || 1;
  const xy = pontos.map((v, i) => [(i / (pontos.length - 1)) * W, max === min ? H / 2 : H - 6 - ((v - min) / amp) * (H - 12)]);
  const linha = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${linha} L${W},${H} L0,${H} Z`;
  const [ux, uy] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Evolução do saldo no mês" style={{ overflow: "visible" }}>
      <path d={area} fill="currentColor" opacity=".12" />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r="3.5" fill="currentColor" />
    </svg>
  );
}
