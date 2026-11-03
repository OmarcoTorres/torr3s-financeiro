import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { db, ehCartao, novoId, type Conta, type Lancamento } from "../db";
import { hoje, saldosContas } from "../lib/calc";
import { dataCurta, dinheiro, lerValor, numeroBR } from "../lib/format";
import { ItemLancamento } from "../components/ItemLancamento";
import { BotaoConfirmar, CORES, Campo, Folha, useAviso, type DadosApp } from "../components/ui";
import type { Rascunho } from "../components/LancamentoForm";

/** Fatura em aberto = quanto o cartão está "devendo" (saldo negativo). */
export function situacaoCartao(c: Conta, lanc: Lancamento[]) {
  const saldo = saldosContas([c], lanc).get(c.id) ?? 0;
  const usado = Math.max(0, -saldo);
  const limite = c.limite ?? 0;
  return { usado, limite, disponivel: Math.max(0, limite - usado), pct: limite ? Math.min(100, (usado / limite) * 100) : 0 };
}

export function proximoVencimento(dia?: number) {
  if (!dia) return undefined;
  const h = hoje();
  const [a, m] = h.split("-").map(Number);
  const z = (n: number) => String(n).padStart(2, "0");
  const ultimo = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();
  let alvo = `${a}-${z(m)}-${z(Math.min(dia, ultimo(a, m)))}`;
  if (alvo < h) { const nm = m === 12 ? 1 : m + 1, na = m === 12 ? a + 1 : a; alvo = `${na}-${z(nm)}-${z(Math.min(dia, ultimo(na, nm)))}`; }
  return alvo;
}

export const fundoCartao = (cor: string) => `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 60%, #0b0d1f))`;

export function MiniCartao({ c }: { c: Conta }) {
  return (
    <div className="cartao-mini" style={{ background: fundoCartao(c.cor) }}>
      <span>{c.nome.split(" ")[0]}</span>
      <span className="pts">••••</span>
      <span className="fin">{c.final || "0000"}</span>
    </div>
  );
}

export function Cartoes({ dados, abrir, pagar }: { dados: DadosApp; abrir: (l: Lancamento) => void; pagar: (r: Rascunho) => void }) {
  const [edit, setEdit] = useState<(Partial<Conta> & { limiteTxt?: string; diaTxt?: string }) | null>(null);
  const cartoes = dados.contas.filter(ehCartao);
  const total = cartoes.reduce((a, c) => a + situacaoCartao(c, dados.lanc).usado, 0);

  return (
    <>
      <div className="kpis">
        <div className="kpi-card"><span className="rotulo">Faturas abertas</span><span className="v num neg">{dinheiro(total)}</span></div>
        <div className="kpi-card"><span className="rotulo">Limite disponível</span><span className="v num">{dinheiro(cartoes.reduce((a, c) => a + situacaoCartao(c, dados.lanc).disponivel, 0))}</span></div>
      </div>
      <section className="card">
        <div className="cab"><h2>Cartões ativos</h2><button type="button" className="btn suave" onClick={() => setEdit({ cor: CORES[0], tipo: "cartao" })}><Plus />Novo cartão</button></div>
        {cartoes.length === 0 ? (
          <div className="vazio"><CreditCard /><div>Cadastre seus cartões para acompanhar fatura, limite e vencimento. Depois, escolha o cartão ao lançar uma compra.</div></div>
        ) : (
          <div className="lista">
            {cartoes.map((c) => {
              const s = situacaoCartao(c, dados.lanc);
              return (
                <button key={c.id} type="button" className="cartao" onClick={() => setEdit({ ...c, limiteTxt: c.limite ? numeroBR(c.limite) : "", diaTxt: c.vencimentoDia ? String(c.vencimentoDia) : "" })}>
                  <MiniCartao c={c} />
                  <div>
                    <span className="nm">{c.nome}</span>
                    <span className="det">{c.vencimentoDia ? `Vence dia ${c.vencimentoDia}` : "Sem vencimento"}{c.limite ? ` · Disponível ${dinheiro(s.disponivel)}` : ""}</span>
                    {c.limite ? <div className="trilho-prog"><i style={{ width: `${s.pct}%`, background: c.cor }} /></div> : null}
                  </div>
                  <b className="num fat">{dinheiro(s.usado)}</b>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <EditarCartao edit={edit} setEdit={setEdit} dados={dados} abrir={(l) => { setEdit(null); abrir(l); }} pagar={(r) => { setEdit(null); pagar(r); }} />
    </>
  );
}

function EditarCartao({ edit, setEdit, dados, abrir, pagar }: {
  edit: (Partial<Conta> & { limiteTxt?: string; diaTxt?: string }) | null; setEdit: (e: typeof edit) => void; dados: DadosApp;
  abrir: (l: Lancamento) => void; pagar: (r: Rascunho) => void;
}) {
  const aviso = useAviso();
  if (!edit) return null;
  const existente = dados.contas.find((c) => c.id === edit.id);
  const s = existente ? situacaoCartao(existente, dados.lanc) : null;
  const compras = existente ? dados.lanc.filter((l) => l.contaId === existente.id || l.contaDestinoId === existente.id).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6) : [];
  const usos = existente ? dados.lanc.filter((l) => l.contaId === existente.id || l.contaDestinoId === existente.id).length : 0;
  const contaPagadora = dados.contas.find((c) => !ehCartao(c));

  async function salvar() {
    if (!edit?.nome?.trim()) { aviso("Dê um nome ao cartão."); return; }
    const dia = Number(edit.diaTxt);
    await db.contas.put({
      id: edit.id ?? novoId(), nome: edit.nome.trim(), tipo: "cartao", cor: edit.cor ?? CORES[0], saldoInicial: existente?.saldoInicial ?? 0,
      limite: lerValor(edit.limiteTxt ?? "") ?? undefined, vencimentoDia: dia >= 1 && dia <= 31 ? dia : undefined, final: (edit.final ?? "").replace(/\D/g, "").slice(-4) || undefined,
    });
    aviso("Cartão salvo."); setEdit(null);
  }

  return (
    <Folha titulo={existente ? existente.nome : "Novo cartão"} aberta fechar={() => setEdit(null)}>
      {existente && s && (
        <div className="bloco">
          <div className="cab"><span className="rotulo">Fatura em aberto</span>{existente.vencimentoDia && <span className="chip">vence {dataCurta(proximoVencimento(existente.vencimentoDia))}</span>}</div>
          <b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.6rem", fontWeight: 600 }}>{dinheiro(s.usado)}</b>
          {s.limite > 0 && <div className="trilho-prog"><i style={{ width: `${s.pct}%`, background: existente.cor }} /></div>}
          {s.limite > 0 && <span className="muted" style={{ fontSize: ".84rem" }}>Disponível {dinheiro(s.disponivel)} de {dinheiro(s.limite)}</span>}
          {s.usado > 0 && contaPagadora && (
            <div><button type="button" className="btn pri" onClick={() => pagar({ tipo: "transferencia", descricao: `Fatura ${existente.nome}`, valor: s.usado, contaId: contaPagadora.id, contaDestinoId: existente.id, status: "pago" })}>Pagar fatura</button></div>
          )}
        </div>
      )}
      <Campo rotulo="Nome do cartão"><input id="ct-nome" value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} placeholder="Ex.: Nubank Platinum" maxLength={40} /></Campo>
      <div className="duas">
        <Campo rotulo="Final (4 dígitos)"><input id="ct-final" inputMode="numeric" value={edit.final ?? ""} onChange={(e) => setEdit({ ...edit, final: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="4172" /></Campo>
        <Campo rotulo="Dia do vencimento"><input id="ct-dia" inputMode="numeric" value={edit.diaTxt ?? ""} onChange={(e) => setEdit({ ...edit, diaTxt: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="10" /></Campo>
      </div>
      <Campo rotulo="Limite (R$)"><input id="ct-limite" inputMode="decimal" value={edit.limiteTxt ?? ""} onChange={(e) => setEdit({ ...edit, limiteTxt: e.target.value })} placeholder="5.000,00" /></Campo>
      <div className="campo"><span>Cor</span><div className="cores">{CORES.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={(edit.cor ?? CORES[0]) === c} style={{ background: fundoCartao(c) }} onClick={() => setEdit({ ...edit, cor: c })} />)}</div></div>
      {compras.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem" }}>Últimas movimentações</h2>
          <div className="lista">{compras.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div>
        </>
      )}
      <div className="linha-botoes" style={{ justifyContent: "space-between" }}>
        {existente ? (usos
          ? <span className="muted" style={{ fontSize: ".82rem", alignSelf: "center" }}>Tem {usos} lançamento(s); não pode ser excluído.</span>
          : <BotaoConfirmar confirmar="Toque de novo para excluir" onConfirm={async () => { await db.contas.delete(existente.id); aviso("Cartão excluído."); setEdit(null); }}>Excluir</BotaoConfirmar>) : <span />}
        <button type="button" className="btn pri" onClick={salvar}>Salvar</button>
      </div>
    </Folha>
  );
}
