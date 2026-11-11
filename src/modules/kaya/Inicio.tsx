import { BookHeart, Check, ChevronRight, HeartHandshake, HeartPulse, PenLine, Plus, Sparkles, Wind, X } from "lucide-react";
import { salvar, useKaya } from "./dados";
import { diaLocal, hojeIso, reais } from "./pecas";
import { ItemRegistro } from "./Registros";
import { de, gastoDoMes, perfilDe, semana } from "./Telas";
import { APOIO, DISCLAIMER, fraseDoDia, mostrarApoio } from "./textos";
import type { Regra } from "./tipos";
import type { Folhas } from "./KayaApp";
import type { Sec } from "./Mais";

export function Inicio({ abrir, ir }: { abrir: (f: Folhas) => void; ir: (a: "registros" | "insights" | "diario" | "mais", s?: Sec) => void }) {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const hoje = hojeIso();
  const s = semana(itens);
  const gasto = gastoDoMes(itens);
  const pct = p.orcamento ? Math.round((gasto / p.orcamento) * 100) : 0;
  const regs = de(itens, "registro").sort((a, b) => b.quando.localeCompare(a.quando));
  const semDepois = regs.filter((r) => !r.humorDepois && Date.now() - new Date(r.quando).getTime() < 36 * 3_600_000).slice(0, 1);
  const regras = de(itens, "regra").filter((r) => r.ativa);
  const medicinal = p.saude.length > 0;
  const marcar = (r: Regra & { id: string }, v: boolean | undefined) => {
    const historico = { ...r.historico }; if (v === undefined) delete historico[hoje]; else historico[hoje] = v;
    void salvar<Regra>({ tipo: "regra", texto: r.texto, ativa: r.ativa, criadoEm: r.criadoEm, historico }, r.id);
  };

  return (
    <>
      <div className="kpis">
        <div className="kpi-card principal"><span className="rotulo">Dias de pausa na semana</span><span className="v num">{regs.length ? `${s.diasSem} de 7` : "—"}</span></div>
        <div className="kpi-card"><span className="rotulo">Registros na semana</span><span className="v num">{s.total}{s.anterior ? <small className="kaya-delta"> {s.total <= s.anterior ? "↓" : "↑"} {s.anterior} antes</small> : null}</span></div>
        <div className="kpi-card"><span className="rotulo">Com intenção</span><span className="v num">{s.total ? `${Math.round((s.intencionais / s.total) * 100)}%` : "—"}</span></div>
        <div className="kpi-card"><span className="rotulo">Gasto do mês</span><span className={`v num ${pct >= 100 ? "neg" : ""}`}>{reais(gasto)}</span></div>
      </div>

      <div className="atalhos">
        <button type="button" className="btn" onClick={() => abrir("registrar")}><span className="bolha"><Plus size={18} /></span>Check-in e registro</button>
        <button type="button" className="btn" onClick={() => abrir("pausa")}><span className="bolha"><Wind size={18} /></span>Preciso de uma pausa</button>
        <button type="button" className="btn" onClick={() => abrir("diario")}><span className="bolha"><PenLine size={18} /></span>Escrever no diário</button>
        {medicinal
          ? <button type="button" className="btn" onClick={() => ir("mais", "medicinal")}><span className="bolha"><HeartPulse size={18} /></span>Sintomas de hoje</button>
          : <button type="button" className="btn" onClick={() => ir("insights")}><span className="bolha"><Sparkles size={18} /></span>Ver minhas tendências</button>}
      </div>

      <div className="grade-dash">
        <section className="card largo kaya-intencao">
          <span className="rotulo">Seu norte</span>
          <div className="norte">{p.norte || "Registrar com honestidade e escolher com calma."}</div>
          <small>{fraseDoDia()}</small>
        </section>

        {semDepois.map((r) => (
          <section key={r.id} className="aviso dica largo"><Sparkles /><div><b>Como você ficou depois?</b> Complete o registro de {new Date(r.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} para ver intenção x resultado.
            <div className="linha-botoes"><button type="button" className="btn" onClick={() => ir("registros")}>Completar</button></div></div></section>
        ))}

        <section className="card">
          <div className="cab"><h2>Pacto de hoje</h2><button type="button" className="btn fantasma" onClick={() => ir("mais", "pacto")}>{regras.length ? "Editar" : "Criar"}</button></div>
          {regras.length ? <div className="lista">{regras.map((r) => {
            const v = r.historico[hoje];
            return (
              <div key={r.id} className="item" style={{ gridTemplateColumns: "1fr auto" }}>
                <div><div className="tt" style={{ whiteSpace: "normal" }}>{r.texto}</div><div className="meta">{v === true ? "cumprida hoje" : v === false ? "não hoje, tudo bem" : "ainda em aberto"}</div></div>
                <div className="linha-botoes" style={{ flexWrap: "nowrap" }}>
                  <button type="button" className={`btn icone kaya-ok ${v === true ? "on" : ""}`} aria-pressed={v === true} aria-label="Cumpri" onClick={() => marcar(r, v === true ? undefined : true)}><Check /></button>
                  <button type="button" className={`btn icone kaya-nao ${v === false ? "on" : ""}`} aria-pressed={v === false} aria-label="Não hoje" onClick={() => marcar(r, v === false ? undefined : false)}><X /></button>
                </div>
              </div>
            );
          })}</div> : <div className="vazio"><HeartHandshake /><div>Crie regras suas, como "não usar antes de dirigir".</div></div>}
        </section>

        <section className="card">
          <div className="cab"><h2>Últimos registros</h2><button type="button" className="btn fantasma" onClick={() => ir("registros")}>Ver todos</button></div>
          {regs.length ? <div className="lista">{regs.slice(0, 4).map((r) => <ItemRegistro key={r.id} r={r} />)}</div>
            : <div className="vazio"><BookHeart /><div>Nenhum registro ainda. Toque em <b>Registrar</b> quando quiser.</div></div>}
        </section>

        <section className="card">
          <div className="cab"><h2>Orçamento do mês</h2><button type="button" className="btn fantasma" onClick={() => ir("mais", "gastos")}>{p.orcamento ? "Detalhes" : "Definir"}</button></div>
          {p.orcamento ? (
            <>
              <div className="duas"><div className="kpi"><span className="k">Gasto</span><span className="v num">{reais(gasto)}</span></div><div className="kpi"><span className="k">Orçamento</span><span className="v num">{reais(p.orcamento)}</span></div></div>
              <div className={`trilho-prog ${pct >= 100 ? "estourou" : ""}`}><i style={{ width: `${Math.min(100, pct)}%`, background: pct >= 80 && pct < 100 ? "var(--terra)" : undefined }} /></div>
              <span className="muted" style={{ fontSize: ".85rem" }}>{pct >= 100 ? "Você chegou ao limite que escolheu. Vale olhar com calma o que trouxe até aqui." : pct >= 80 ? `${pct}% do orçamento usado.` : `${100 - pct}% ainda disponível.`}</span>
            </>
          ) : <div className="vazio"><div>Defina um orçamento mensal para acompanhar quanto vai para isso.</div></div>}
        </section>

        <section className="card">
          <div className="cab"><h2>Semana</h2><button type="button" className="btn fantasma" onClick={() => ir("insights")}>Insights</button></div>
          <div className="kaya-semana">{s.porDia.map((n, i) => <div key={i}><i style={{ height: `${Math.max(3, (n / Math.max(1, ...s.porDia)) * 70)}px`, opacity: n ? 1 : 0.35 }} /><span>{["D", "S", "T", "Q", "Q", "S", "S"][new Date(`${s.dias[i]}T12:00`).getDay()]}</span></div>)}</div>
          <span className="muted" style={{ fontSize: ".85rem" }}>{s.leitura}</span>
        </section>

        {(p.perfilUso === "em_reavaliacao" || mostrarApoio(p)) && (
          <section className="card">
            <div className="cab"><h2>Apoio, se precisar</h2></div>
            <div className="menu-lista">{APOIO.slice(0, 2).map((a) => <a key={a.nome} href={a.link} className="kaya-link" target={a.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><span className="ic-m"><HeartHandshake /></span><span><b>{a.nome}</b><small>{a.detalhe}</small></span><ChevronRight /></a>)}</div>
          </section>
        )}
      </div>
      <p className="kaya-disclaimer">{DISCLAIMER} Registros feitos hoje: {regs.filter((r) => diaLocal(r.quando) === hoje).length}.</p>
    </>
  );
}
