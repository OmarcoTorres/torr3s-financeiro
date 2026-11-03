import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Send } from "lucide-react";
import { db, novoId, type Lancamento } from "../db";
import { perguntar, resumoParaIA, type Proposta } from "../lib/ia";
import { hoje, mesDe, mesFechado, somarDias } from "../lib/calc";
import { dataBR, dataCurta, dinheiro, mesExtenso } from "../lib/format";
import { carregarAvisos, marcarLidos, type AvisoHist } from "../lib/avisos";
import { BotaoConfirmar, Folha, useAviso, useConfig, type DadosApp } from "./ui";

type Msg = { papel: "user" | "assistant"; texto: string; quando?: string; propostas?: (Proposta & { estado?: "salva" | "descartada" })[] };
type Item = { tipo: "aviso"; quando: string; aviso: AvisoHist } | { tipo: "msg"; quando: string; msg: Msg; i: number };

const SUGESTOES = ["O que vence esta semana?", "Resuma o mês", "Quanto gastei com combustível este mês?", "Paguei 150 de internet hoje"];
const norm = (s?: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const diaLocal = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function rotuloDia(dia: string) {
  const h = hoje();
  if (dia === h) return "Hoje";
  if (dia === somarDias(h, -1)) return "Ontem";
  return dataCurta(dia);
}

/** Assistente: histórico dos avisos enviados (bom dia, vencimentos, faturas, metas) + conversa, tudo guardado. */
export function Assistente({ aberta, fechar, dados }: { aberta: boolean; fechar: () => void; dados: DadosApp }) {
  const aviso = useAviso();
  const [msgs, setMsgs] = useConfig<Msg[]>("chat-historico", []);
  const [avisos, setAvisos] = useState<AvisoHist[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // Ao abrir: busca os avisos guardados e marca os novos como vistos.
  useEffect(() => {
    if (!aberta) return;
    carregarAvisos().then((a) => {
      setAvisos(a);
      void marcarLidos(a.filter((x) => !x.lido_em).map((x) => x.id));
    });
  }, [aberta]);

  const itens = useMemo(() => {
    const lista: Item[] = [
      ...avisos.map((a) => ({ tipo: "aviso" as const, quando: a.criado_em, aviso: a })),
      ...msgs.map((m, i) => ({ tipo: "msg" as const, quando: m.quando ?? "1970-01-01T00:00:00Z", msg: m, i })),
    ];
    return lista.sort((a, b) => a.quando.localeCompare(b.quando));
  }, [avisos, msgs]);

  useEffect(() => { if (aberta) setTimeout(() => fim.current?.scrollIntoView({ block: "end" }), 60); }, [aberta, itens.length, pensando]);

  const salvarMsgs = (m: Msg[]) => setMsgs(m.slice(-80));

  async function enviar(t = texto) {
    const pergunta = t.trim();
    if (!pergunta || pensando) return;
    const historico = msgs.slice(-8).map((m) => ({ papel: m.papel, texto: m.texto }));
    const comPergunta = [...msgs, { papel: "user" as const, texto: pergunta, quando: new Date().toISOString() }];
    await salvarMsgs(comPergunta);
    setTexto(""); setPensando(true);
    try {
      const r = await perguntar(pergunta, historico, resumoParaIA(dados));
      await salvarMsgs([...comPergunta, { papel: "assistant", texto: r.texto, propostas: r.propostas, quando: new Date().toISOString() }]);
    } catch (e) {
      await salvarMsgs([...comPergunta, { papel: "assistant", texto: (e as Error).message, quando: new Date().toISOString() }]);
    } finally {
      setPensando(false);
    }
  }

  function marcar(iMsg: number, iProp: number, estado: "salva" | "descartada") {
    void salvarMsgs(msgs.map((x, i) => (i !== iMsg ? x : { ...x, propostas: x.propostas?.map((p, j) => (j === iProp ? { ...p, estado } : p)) })));
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

  let ultimoDia = "";
  return (
    <Folha titulo="Assistente" aberta={aberta} fechar={fechar}
      acoes={msgs.length > 0 ? <BotaoConfirmar className="btn fantasma" confirmar="Apagar conversa?" onConfirm={() => void setMsgs([])}>Limpar</BotaoConfirmar> : undefined}>
      <div className="chat">
        {itens.length === 0 && (
          <div className="msg a">Aqui ficam os avisos do Invest+ (bom dia, vencimentos, faturas e metas) e a nossa conversa. Pergunte sobre seus lançamentos ou escreva algo como "paguei 150 de internet hoje": o lançamento aparece pronto e você confirma antes de salvar.</div>
        )}
        {itens.map((it) => {
          const dia = diaLocal(it.quando);
          const separador = dia !== ultimoDia && it.quando > "1971" ? <div className="dia-chat" key={`d-${dia}-${it.quando}`}>{rotuloDia(dia)}</div> : null;
          ultimoDia = dia;
          if (it.tipo === "aviso") {
            const a = it.aviso;
            return (
              <div key={`a-${a.id}`} style={{ display: "grid", gap: 8 }}>
                {separador}
                <div className={`aviso-chat ${a.lido_em ? "" : "novo"}`}>
                  <div className="cab"><span className="rotulo" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Bell size={13} />Aviso · {hora(a.criado_em)}</span>{!a.lido_em && <span className="chip">novo</span>}</div>
                  <b>{a.titulo}</b>
                  <span style={{ whiteSpace: "pre-wrap" }}>{a.corpo}</span>
                </div>
              </div>
            );
          }
          const m = it.msg, i = it.i;
          return (
            <div key={`m-${i}`} style={{ display: "grid", gap: 8 }}>
              {separador}
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
          );
        })}
        {pensando && <div className="msg a"><span className="carregando" aria-label="Pensando" /></div>}
        {!pensando && <div className="sugestoes">{SUGESTOES.map((s) => <button key={s} type="button" onClick={() => enviar(s)}>{s}</button>)}</div>}
        <div ref={fim} />
      </div>
      <form className="chat-entrada" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <input id="assist-txt" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: quanto gastei com mercado?" aria-label="Pergunta" enterKeyHint="send" />
        <button className="btn pri icone" type="submit" aria-label="Enviar" disabled={pensando || !texto.trim()}><Send /></button>
      </form>
    </Folha>
  );
}
