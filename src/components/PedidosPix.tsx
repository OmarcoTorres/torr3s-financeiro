import { useState } from "react";
import { Check, Copy, Send, X } from "lucide-react";
import { cancelarPedido, pedirPix, responderPedido, usePedidos, usePedidosEstado, type PedidoPix } from "../lib/pedidosPix";
import { useTemaAtivo } from "../lib/grupos";
import { pixCopiaECola } from "../lib/pix";
import { primeiroNome } from "../lib/tema";
import { dinheiro, lerValor } from "../lib/format";
import { BotaoConfirmar, Campo, Folha, useAviso } from "./ui";
import { InputValor } from "./campos";

const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const ROTULO: Record<PedidoPix["status"], string> = { pendente: "aguardando", feito: "Pix feito", recusado: "recusado", cancelado: "cancelado" };

/** Pix copia e cola para o DESTINO do pedido (chave de quem vai receber), já com o valor. */
const codigoDoPedido = (p: PedidoPix) => pixCopiaECola({ chave: p.chave, recebedor: p.favorecido, cidade: "SAO PAULO", valorCentavos: p.valor, mensagem: p.motivo ?? undefined });

/** Topo do app: pedidos de Pix que estão esperando VOCÊ pagar. */
export function PedidosParaMim() {
  const { pedidos } = usePedidos();
  const aviso = useAviso();
  const [trabalhando, setTrabalhando] = useState("");
  const [recusando, setRecusando] = useState<string | null>(null);
  const [recado, setRecado] = useState("");
  const pendentes = pedidos.filter((p) => p.para_mim && p.status === "pendente");
  if (!pendentes.length) return null;

  async function copiar(p: PedidoPix) {
    try { await navigator.clipboard.writeText(codigoDoPedido(p)); aviso("Pix copiado. No app do banco: Pix › Pix copia e cola."); }
    catch { try { await navigator.clipboard.writeText(p.chave); aviso("Chave copiada."); } catch { aviso(`Chave: ${p.chave}`); } }
  }
  async function responder(p: PedidoPix, status: "feito" | "recusado") {
    setTrabalhando(p.id);
    try {
      const n = await responderPedido(p.id, status, status === "recusado" ? recado : "");
      aviso(`${status === "feito" ? "Pronto! " : ""}${primeiroNome(p.solicitante_nome)} ${n ? "foi avisada(o) no celular" : "vai ver no app"}.`);
      setRecusando(null); setRecado("");
    } catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(""); }
  }

  return (
    <div className="aviso dica" id="pix" role="region" aria-label="Pedidos de Pix para você">
      <Send />
      <div style={{ display: "grid", gap: 12, width: "100%" }}>
        {pendentes.map((p) => (
          <div key={p.id} style={{ display: "grid", gap: 6 }}>
            <b>{primeiroNome(p.solicitante_nome)} pediu um Pix de {dinheiro(p.valor)}</b>
            <span className="muted" style={{ fontSize: ".86rem" }}>Para <b>{p.favorecido}</b> · chave {p.chave}{p.motivo ? ` · “${p.motivo}”` : ""} · {quando(p.criado_em)}</span>
            {recusando === p.id ? (
              <div className="busca">
                <input className="entrada" placeholder="Recado (opcional)" value={recado} maxLength={140} onChange={(e) => setRecado(e.target.value)} aria-label="Recado" />
                <button type="button" className="btn" disabled={!!trabalhando} onClick={() => void responder(p, "recusado")}>Recusar</button>
              </div>
            ) : (
              <div className="linha-botoes">
                <button type="button" className="btn pri" onClick={() => void copiar(p)}><Copy />Copiar Pix</button>
                <BotaoConfirmar className="btn" confirmar="Já pagou no banco?" onConfirm={() => void responder(p, "feito")}><Check />Fiz o Pix</BotaoConfirmar>
                <button type="button" className="btn fantasma" onClick={() => setRecusando(p.id)}><X />Recusar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card em Metas: pedir um Pix para alguém do grupo pagar + histórico. */
export function PedirPix({ meuId }: { meuId?: string }) {
  const { grupo } = useTemaAtivo(meuId);
  const { pedidos, erro } = usePedidosEstado();
  const aviso = useAviso();
  const [aberta, setAberta] = useState(false);
  const outros = (grupo?.membros ?? []).filter((m) => m.user_id !== meuId);
  const [f, setF] = useState({ valor: "", chave: "", favorecido: "", motivo: "", responsavel: "" });
  const [trabalhando, setTrabalhando] = useState(false);
  // Banco ainda sem a migração 0010: o card não aparece (nada quebrado na tela).
  if (!grupo || !outros.length || erro?.includes("0010")) return null;
  const responsavel = f.responsavel || outros[0].user_id;
  const historico = pedidos.filter((p) => p.grupo_id === grupo.id && p.status !== "cancelado").slice(0, 6);

  async function enviar() {
    const v = lerValor(f.valor) ?? 0;
    if (v <= 0) { aviso("Digite o valor."); return; }
    if (f.chave.trim().length < 3) { aviso("Informe a chave Pix de quem vai receber."); return; }
    if (!f.favorecido.trim()) { aviso("Informe o nome de quem vai receber."); return; }
    setTrabalhando(true);
    try {
      const n = await pedirPix({ grupo: grupo!.id, responsavel, valor: v, chave: f.chave.trim(), favorecido: f.favorecido.trim(), motivo: f.motivo.trim() });
      const nome = primeiroNome(outros.find((o) => o.user_id === responsavel)?.nome);
      aviso(n ? `Pedido enviado. ${nome} recebeu a notificação.` : `Pedido enviado. ${nome} vai ver ao abrir o app (o celular não está com notificações ativas).`);
      setF({ valor: "", chave: "", favorecido: "", motivo: "", responsavel: "" }); setAberta(false);
    } catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(false); }
  }

  return (
    <section className="card">
      <div className="cab"><h2>Pedir um Pix</h2><Send size={18} className="muted" /></div>
      <span className="muted" style={{ fontSize: ".88rem" }}>Precisa pagar algo pela conta de {outros.length === 1 ? primeiroNome(outros[0].nome) : "alguém do grupo"}? Peça aqui: chega uma notificação, o Pix sai pelo banco e você é avisada(o) quando for feito.</span>
      <div><button type="button" className="btn pri" onClick={() => setAberta(true)}><Send />Pedir Pix</button></div>
      {historico.length > 0 && (
        <div style={{ display: "grid" }}>
          {historico.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ minWidth: 0 }}>
                <b className="num">{dinheiro(p.valor)}</b> <span className="muted">→ {p.favorecido}</span>
                <div style={{ fontSize: ".78rem" }} className={p.status === "feito" ? "pos" : p.status === "recusado" ? "neg" : "warn"}>
                  {p.meu ? `você pediu a ${primeiroNome(p.responsavel_nome)}` : `${primeiroNome(p.solicitante_nome)} pediu a você`} · {ROTULO[p.status]}{p.resposta ? ` · “${p.resposta}”` : ""} · {quando(p.respondido_em ?? p.criado_em)}
                </div>
              </div>
              {p.meu && p.status === "pendente" && (
                <BotaoConfirmar className="btn fantasma" confirmar="Cancelar pedido?" onConfirm={async () => { try { await cancelarPedido(p.id); aviso("Pedido cancelado."); } catch (e) { aviso(String((e as Error).message)); } }}>Cancelar</BotaoConfirmar>
              )}
            </div>
          ))}
        </div>
      )}
      {erro && <div className="aviso neg" role="alert">{erro}</div>}

      <Folha titulo="Pedir um Pix" aberta={aberta} fechar={() => setAberta(false)}>
        <Campo rotulo="Valor"><InputValor id="pp-valor" value={f.valor} onChange={(v) => setF({ ...f, valor: v })} /></Campo>
        <Campo rotulo="Chave Pix de quem vai receber"><input value={f.chave} autoCapitalize="none" autoCorrect="off" placeholder="CPF, e-mail, celular ou chave aleatória" onChange={(e) => setF({ ...f, chave: e.target.value })} /></Campo>
        <Campo rotulo="Nome de quem vai receber"><input value={f.favorecido} maxLength={60} onChange={(e) => setF({ ...f, favorecido: e.target.value })} /></Campo>
        <Campo rotulo="Motivo (opcional)"><input value={f.motivo} maxLength={140} placeholder="Ex.: passagem, conta de luz" onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Campo>
        {outros.length > 1 && (
          <label className="campo"><span>Quem vai fazer o Pix</span>
            <select value={responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })}>
              {outros.map((o) => <option key={o.user_id} value={o.user_id}>{o.nome}</option>)}
            </select>
          </label>
        )}
        <div className="linha-botoes"><button type="button" className="btn pri" disabled={trabalhando} onClick={() => void enviar()}><Send />{trabalhando ? "Enviando…" : `Pedir para ${primeiroNome(outros.find((o) => o.user_id === responsavel)?.nome)}`}</button></div>
      </Folha>
    </section>
  );
}
