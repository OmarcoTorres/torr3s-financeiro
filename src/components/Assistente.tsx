import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { db, novoId, type Lancamento } from "../db";
import { perguntar, resumoParaIA, type Proposta } from "../lib/ia";
import { hoje, mesDe, mesFechado } from "../lib/calc";
import { dataBR, dinheiro, mesExtenso } from "../lib/format";
import { Folha, useAviso, type DadosApp } from "./ui";

type Msg = { papel: "user" | "assistant"; texto: string; propostas?: (Proposta & { estado?: "salva" | "descartada" })[] };

const SUGESTOES = ["O que vence esta semana?", "Resuma o mês", "Quanto gastei com combustível este mês?", "Paguei 150 de internet hoje"];
const norm = (s?: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function Assistente({ aberta, fechar, dados }: { aberta: boolean; fechar: () => void; dados: DadosApp }) {
  const aviso = useAviso();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs, pensando]);

  async function enviar(t = texto) {
    const pergunta = t.trim();
    if (!pergunta || pensando) return;
    const historico = msgs.map((m) => ({ papel: m.papel, texto: m.texto }));
    setMsgs((m) => [...m, { papel: "user", texto: pergunta }]);
    setTexto(""); setPensando(true);
    try {
      const r = await perguntar(pergunta, historico, resumoParaIA(dados));
      setMsgs((m) => [...m, { papel: "assistant", texto: r.texto, propostas: r.propostas }]);
    } catch (e) {
      setMsgs((m) => [...m, { papel: "assistant", texto: (e as Error).message }]);
    } finally {
      setPensando(false);
    }
  }

  function marcar(iMsg: number, iProp: number, estado: "salva" | "descartada") {
    setMsgs((m) => m.map((x, i) => (i !== iMsg ? x : { ...x, propostas: x.propostas?.map((p, j) => (j === iProp ? { ...p, estado } : p)) })));
  }

  async function salvar(p: Proposta, iMsg: number, iProp: number) {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : hoje();
    if (mesFechado(dados.fech, data)) { aviso(`${mesExtenso(mesDe(data))} está fechado. Reabra o mês para lançar.`); return; }
    const cat = dados.cats.find((c) => norm(c.nome) === norm(p.categoria) && c.tipo === p.tipo);
    const conta = dados.contas.find((c) => norm(c.nome) === norm(p.conta)) ?? dados.contas[0];
    const pessoa = dados.pessoas.find((x) => norm(x.nome) === norm(p.pessoa));
    if (!conta) { aviso("Cadastre uma conta antes."); return; }
    const l: Lancamento = {
      id: novoId(), criadoEm: new Date().toISOString(), tipo: p.tipo, descricao: p.descricao.slice(0, 140),
      valor: Math.round(Number(p.valor) * 100), data, vencimento: p.vencimento || undefined,
      status: p.status === "pendente" ? "pendente" : "pago", categoriaId: cat?.id, contaId: conta.id, pessoaId: pessoa?.id,
    };
    if (!(l.valor > 0)) { aviso("Valor inválido na proposta."); return; }
    await db.lancamentos.add(l);
    marcar(iMsg, iProp, "salva");
    aviso("Lançamento salvo.");
  }

  return (
    <Folha titulo="Assistente" aberta={aberta} fechar={fechar}>
      <div className="chat">
        {msgs.length === 0 && (
          <>
            <div className="msg a">Pergunte sobre seus números ou peça para registrar algo. Eu preparo o lançamento e você confirma antes de salvar.</div>
            <div className="sugestoes">{SUGESTOES.map((s) => <button key={s} type="button" onClick={() => enviar(s)}>{s}</button>)}</div>
          </>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "grid", gap: 8 }}>
            <div className={`msg ${m.papel === "user" ? "u" : "a"}`}>{m.texto}</div>
            {m.propostas?.map((p, j) => (
              <div key={j} className="proposta">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b>{p.descricao}</b>
                  <b className={`num ${p.tipo === "receita" ? "pos" : "neg"}`}>{p.tipo === "despesa" ? "-" : "+"}{dinheiro(Math.round(Number(p.valor) * 100))}</b>
                </div>
                <div className="muted" style={{ fontSize: ".82rem" }}>
                  {dataBR(p.data)} · {p.status === "pago" ? "pago" : "pendente"}{p.categoria ? ` · ${p.categoria}` : ""}{p.conta ? ` · ${p.conta}` : ""}{p.pessoa ? ` · ${p.pessoa}` : ""}
                </div>
                {p.estado ? <span className="muted" style={{ fontSize: ".82rem" }}>{p.estado === "salva" ? "Salvo." : "Descartado."}</span> : (
                  <div className="linha-botoes">
                    <button type="button" className="btn pri" onClick={() => salvar(p, i, j)}>Salvar lançamento</button>
                    <button type="button" className="btn" onClick={() => marcar(i, j, "descartada")}>Descartar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {pensando && <div className="msg a"><span className="carregando" aria-label="Pensando" /></div>}
        <div ref={fim} />
      </div>
      <form className="chat-entrada" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <input id="assist-txt" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pergunte ou registre…" aria-label="Mensagem para o assistente" enterKeyHint="send" />
        <button className="btn pri icone" type="submit" aria-label="Enviar" disabled={pensando || !texto.trim()}><Send /></button>
      </form>
    </Folha>
  );
}
