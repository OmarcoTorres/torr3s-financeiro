import { useEffect, useState } from "react";
import { AlertTriangle, Camera, ImageUp, NotebookPen, Sparkles, X } from "lucide-react";
import { db, ehCartao, novoId, type Lancamento } from "../db";
import { comprimirImagem, lerAnotacoes, type ItemAnotacao } from "../lib/ia";
import { hoje, somarMeses } from "../lib/calc";
import { dinheiro, lerValor, numeroBR } from "../lib/format";
import { Folha, useAviso, type DadosApp } from "./ui";

/**
 * Lançar das anotações: a pessoa escreve/cola o que anotou (ou fotografa o caderno/print),
 * a IA monta a lista de lançamentos, a pessoa confere/ajusta cada um e lança tudo de uma vez.
 */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const EXEMPLO = "merc 120 ontem\nuber 23,50\nluz 210 vence dia 15\ntênis 600 em 3x no nubank\nrecebi 500 do João";

type Linha = {
  incluir: boolean; tipo: "despesa" | "receita"; descricao: string; valorTxt: string; data: string; status: "pago" | "pendente";
  vencimento: string; categoriaId: string; contaId: string; pessoaId: string; parcelas: number; duvida: string;
};

export function LerAnotacoes({ aberta, fechar, dados }: { aberta: boolean; fechar: () => void; dados: DadosApp }) {
  const aviso = useAviso();
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<Blob>();
  const [fotoUrl, setFotoUrl] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [ignorado, setIgnorado] = useState("");
  const [lancando, setLancando] = useState(false);

  useEffect(() => { if (!aberta) { setTexto(""); setFoto(undefined); setErro(""); setLinhas(null); setIgnorado(""); } }, [aberta]);
  useEffect(() => {
    if (!foto) { setFotoUrl(""); return; }
    const u = URL.createObjectURL(foto); setFotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  const contas = dados.contas;
  const contaPadrao = contas.find((c) => !ehCartao(c))?.id ?? contas[0]?.id ?? "";
  const achar = <T extends { id: string; nome: string }>(lista: T[], nome: string) => (nome ? lista.find((x) => norm(x.nome) === norm(nome)) ?? lista.find((x) => norm(x.nome).includes(norm(nome)) || norm(nome).includes(norm(x.nome))) : undefined);

  function paraLinha(i: ItemAnotacao): Linha {
    const cat = achar(dados.cats.filter((c) => c.tipo === i.tipo), i.categoria);
    return {
      incluir: true, tipo: i.tipo === "receita" ? "receita" : "despesa", descricao: i.descricao || "Lançamento",
      valorTxt: numeroBR(Math.round(i.valor * 100)), data: /^\d{4}-\d{2}-\d{2}$/.test(i.data) ? i.data : hoje(),
      status: i.status === "pendente" ? "pendente" : "pago", vencimento: /^\d{4}-\d{2}-\d{2}$/.test(i.vencimento) ? i.vencimento : "",
      categoriaId: cat?.id ?? "", contaId: achar(contas, i.conta)?.id ?? contaPadrao, pessoaId: achar(dados.pessoas, i.pessoa)?.id ?? "",
      parcelas: Math.max(1, Math.min(48, Math.round(i.parcelas || 1))), duvida: i.duvida || "",
    };
  }

  async function ler() {
    if (!texto.trim() && !foto) { setErro("Escreva ou cole as anotações, ou envie uma foto delas."); return; }
    setLendo(true); setErro("");
    try {
      const imagem = foto ? (await comprimirImagem(foto)).base64 : undefined;
      const r = await lerAnotacoes({
        texto: texto.trim() || undefined, imagem,
        categorias: dados.cats.map((c) => c.nome), contas: contas.map((c) => c.nome), pessoas: dados.pessoas.map((p) => p.nome),
      });
      setLinhas(r.lancamentos.map(paraLinha)); setIgnorado(r.ignorado ?? "");
    } catch (e) { setErro((e as Error).message); } finally { setLendo(false); }
  }

  const mudar = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls!.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const escolhidas = (linhas ?? []).filter((l) => l.incluir && (lerValor(l.valorTxt) ?? 0) > 0);
  const total = escolhidas.reduce((a, l) => a + (l.tipo === "despesa" ? -1 : 1) * (lerValor(l.valorTxt) ?? 0), 0);

  async function lancar() {
    if (!escolhidas.length) return;
    setLancando(true);
    try {
      const agora = new Date().toISOString();
      const novos: Lancamento[] = escolhidas.flatMap((l) => {
        const valor = lerValor(l.valorTxt) ?? 0;
        const n = l.parcelas;
        const noCartao = ehCartao(contas.find((c) => c.id === l.contaId));
        const unit = Math.floor(valor / n);
        const grupo = n > 1 ? novoId() : undefined;
        return Array.from({ length: n }, (_, i) => ({
          id: novoId(), tipo: l.tipo, descricao: n > 1 ? `${l.descricao} ${i + 1}/${n}` : l.descricao,
          valor: i === 0 ? valor - unit * (n - 1) : unit, data: i === 0 ? l.data : somarMeses(l.data, i),
          vencimento: i === 0 ? l.vencimento || undefined : undefined,
          status: noCartao ? "pago" : i === 0 ? l.status : "pendente",
          categoriaId: l.categoriaId || undefined, contaId: l.contaId || undefined, pessoaId: l.pessoaId || undefined,
          grupo, parcela: n > 1 ? i + 1 : undefined, totalParcelas: n > 1 ? n : undefined, criadoEm: agora,
        }) as Lancamento);
      });
      await db.lancamentos.bulkAdd(novos);
      aviso(`${escolhidas.length} ${escolhidas.length === 1 ? "lançamento criado" : "lançamentos criados"} a partir das anotações.`);
      fechar();
    } catch (e) { setErro((e as Error).message); } finally { setLancando(false); }
  }

  return (
    <Folha titulo="Lançar das anotações" aberta={aberta} fechar={fechar}>
      {!linhas ? (
        <>
          <p className="muted" style={{ margin: 0 }}>Escreva ou cole o que você anotou, do jeito que estiver, ou tire foto do caderno ou de um print. A IA monta os lançamentos e você confere antes de salvar.</p>
          <label className="campo"><span>Suas anotações</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} placeholder={EXEMPLO} style={{ fontSize: 16, lineHeight: 1.45 }} maxLength={8000} />
          </label>
          {fotoUrl && (
            <div style={{ position: "relative", justifySelf: "start" }}>
              <img src={fotoUrl} alt="Foto das anotações" className="foto-previa" style={{ maxHeight: 220 }} />
              <button type="button" className="btn icone" style={{ position: "absolute", top: 6, right: 6 }} aria-label="Remover foto" onClick={() => setFoto(undefined)}><X /></button>
            </div>
          )}
          <div className="linha-botoes">
            <label className="btn"><Camera />Foto
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && setFoto(e.target.files[0])} />
            </label>
            <label className="btn fantasma"><ImageUp />Galeria
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setFoto(e.target.files[0])} />
            </label>
          </div>
          {erro && <div className="aviso neg" role="alert">{erro}</div>}
          <button type="button" className="btn pri" disabled={lendo} onClick={() => void ler()} style={{ justifyContent: "center" }}>
            <Sparkles />{lendo ? "Lendo as anotações…" : "Ler com IA"}
          </button>
        </>
      ) : (
        <>
          <div className="cab">
            <span className="muted" style={{ fontSize: ".88rem" }}>{linhas.length} {linhas.length === 1 ? "item encontrado" : "itens encontrados"}. Confira e ajuste o que precisar.</span>
            <button type="button" className="btn fantasma" onClick={() => setLinhas(null)}>Voltar</button>
          </div>
          {ignorado && <div className="aviso dica"><NotebookPen /><div style={{ fontSize: ".86rem" }}>Ficou de fora: {ignorado}</div></div>}
          <div style={{ display: "grid", gap: 10 }}>
            {linhas.map((l, i) => {
              const cats = dados.cats.filter((c) => c.tipo === l.tipo);
              return (
                <div key={i} className="bloco" style={{ gap: 8, opacity: l.incluir ? 1 : 0.55 }}>
                  <div className="cab">
                    <label className="chk" style={{ fontWeight: 700 }}><input type="checkbox" checked={l.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} />Lançar</label>
                    <div className="seg" style={{ display: "flex", gap: 4 }}>
                      {(["despesa", "receita"] as const).map((t) => (
                        <button key={t} type="button" className={`btn ${l.tipo === t ? "pri" : "suave"}`} style={{ minHeight: 34, padding: "4px 10px", fontSize: ".8rem" }}
                          onClick={() => mudar(i, { tipo: t, categoriaId: "" })}>{t === "despesa" ? "Despesa" : "Receita"}</button>
                      ))}
                    </div>
                  </div>
                  <div className="duas" style={{ gridTemplateColumns: "1fr 120px" }}>
                    <label className="campo"><span>Descrição</span><input value={l.descricao} maxLength={140} onChange={(e) => mudar(i, { descricao: e.target.value })} /></label>
                    <label className="campo"><span>Valor (R$)</span><input inputMode="decimal" value={l.valorTxt} onChange={(e) => mudar(i, { valorTxt: e.target.value })} /></label>
                  </div>
                  <div className="duas">
                    <label className="campo"><span>Data</span><input type="date" value={l.data} onChange={(e) => mudar(i, { data: e.target.value })} /></label>
                    <label className="campo"><span>Situação</span>
                      <select value={l.status} onChange={(e) => mudar(i, { status: e.target.value as Linha["status"] })}>
                        <option value="pago">{l.tipo === "receita" ? "Recebido" : "Pago"}</option><option value="pendente">Pendente</option>
                      </select>
                    </label>
                  </div>
                  <div className="duas">
                    <label className="campo"><span>Categoria</span>
                      <select value={l.categoriaId} onChange={(e) => mudar(i, { categoriaId: e.target.value })}>
                        <option value="">Sem categoria</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </label>
                    <label className="campo"><span>Conta</span>
                      <select value={l.contaId} onChange={(e) => mudar(i, { contaId: e.target.value })}>
                        {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </label>
                  </div>
                  {(l.parcelas > 1 || l.vencimento || l.pessoaId) && (
                    <span className="muted" style={{ fontSize: ".8rem" }}>
                      {[l.parcelas > 1 && `${l.parcelas}× de ${dinheiro(Math.floor((lerValor(l.valorTxt) ?? 0) / l.parcelas))}`,
                        l.vencimento && `vence ${l.vencimento.split("-").reverse().join("/")}`,
                        l.pessoaId && `com ${dados.pessoas.find((p) => p.id === l.pessoaId)?.nome}`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {l.duvida && <span className="warn" style={{ fontSize: ".82rem", display: "flex", gap: 6, alignItems: "center" }}><AlertTriangle size={14} />Confira: {l.duvida}</span>}
                </div>
              );
            })}
          </div>
          {erro && <div className="aviso neg" role="alert">{erro}</div>}
          <div className="cab" style={{ position: "sticky", bottom: 0, background: "var(--surface)", paddingBlock: 10 }}>
            <span className={`num ${total >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>{total >= 0 ? "+" : "−"}{dinheiro(Math.abs(total))}</span>
            <button type="button" className="btn pri" disabled={lancando || !escolhidas.length} onClick={() => void lancar()}>
              {lancando ? "Lançando…" : `Lançar ${escolhidas.length} ${escolhidas.length === 1 ? "item" : "itens"}`}
            </button>
          </div>
        </>
      )}
    </Folha>
  );
}
