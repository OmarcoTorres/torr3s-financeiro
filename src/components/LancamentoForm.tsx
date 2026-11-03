import { useEffect, useMemo, useState } from "react";
import { Camera, Lock, Trash2 } from "lucide-react";
import { db, ehCartao, novoId, type Divisao, type Lancamento, type Status, type Tipo } from "../db";
import { hoje, mesDe, mesFechado, somarMeses } from "../lib/calc";
import { dinheiro, lerValor, mesExtenso, numeroBR } from "../lib/format";
import { BotaoConfirmar, Campo, Folha, Seg, useAviso, type DadosApp } from "./ui";

export type Rascunho = Partial<Lancamento>;

/** Última conta usada neste aparelho; na primeira vez, a conta principal (não a carteira nem um cartão). */
function contaPadrao(contas: DadosApp["contas"]) {
  let ultima = "";
  try { ultima = localStorage.getItem("investmais-ultima-conta") ?? ""; } catch { /* sem armazenamento */ }
  if (contas.some((c) => c.id === ultima)) return ultima;
  const normais = contas.filter((c) => !ehCartao(c));
  return (normais.find((c) => /^conta/i.test(c.nome)) ?? [...normais].sort((a, b) => b.saldoInicial - a.saldoInicial)[0] ?? contas[0])?.id ?? "";
}

type Repetir = "nao" | "parcelado" | "mensal";

export function LancamentoForm({ rascunho, fotoNova, fechar, dados }: { rascunho: Rascunho | null; fotoNova?: Blob; fechar: () => void; dados: DadosApp }) {
  const aviso = useAviso();
  const editando = !!rascunho?.id;
  const [tipo, setTipo] = useState<Tipo>("despesa");
  const [valorTxt, setValorTxt] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(hoje());
  const [vencimento, setVencimento] = useState("");
  const [status, setStatus] = useState<Status>("pago");
  const [categoriaId, setCategoriaId] = useState("");
  const [contaId, setContaId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [foto, setFoto] = useState<Blob | undefined>();
  const [fotoUrl, setFotoUrl] = useState("");
  const [repetir, setRepetir] = useState<Repetir>("nao");
  const [vezes, setVezes] = useState("2");
  const [dividir, setDividir] = useState(false);
  const [modoDiv, setModoDiv] = useState<"valor" | "pct">("valor");
  const [partes, setPartes] = useState<{ pessoaId: string; txt: string }[]>([]);
  const [erro, setErro] = useState("");

  // Carrega o rascunho ao abrir.
  useEffect(() => {
    if (!rascunho) return;
    const r = rascunho;
    setTipo(r.tipo ?? "despesa");
    setValorTxt(r.valor ? numeroBR(r.valor) : "");
    setDescricao(r.descricao ?? "");
    setData(r.data ?? hoje());
    setVencimento(r.vencimento ?? "");
    setStatus(r.status ?? (r.vencimento && r.vencimento > hoje() ? "pendente" : "pago"));
    setCategoriaId(r.categoriaId ?? "");
    setContaId(r.contaId ?? contaPadrao(dados.contas));
    setContaDestinoId(r.contaDestinoId ?? "");
    setPessoaId(r.pessoaId ?? "");
    setObservacao(r.observacao ?? "");
    setRepetir("nao"); setVezes("2"); setErro("");
    setDividir(!!r.divisao?.length); setModoDiv("valor");
    setPartes((r.divisao ?? []).map((d) => ({ pessoaId: d.pessoaId, txt: numeroBR(d.valor) })));
    setFoto(fotoNova);
    if (r.fotoId) db.fotos.get(r.fotoId).then((f) => f && setFoto(f.blob));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir: dados que chegam da sincronização não podem apagar o que está sendo digitado.
  }, [rascunho, fotoNova]);

  useEffect(() => {
    if (!foto) { setFotoUrl(""); return; }
    const u = URL.createObjectURL(foto); setFotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  const valor = lerValor(valorTxt) ?? 0;
  const bloqueado = editando && rascunho?.data ? mesFechado(dados.fech, rascunho.data) : false;
  const catsDoTipo = useMemo(() => {
    const doTipo = dados.cats.filter((c) => tipo !== "transferencia" && c.tipo === tipo);
    const pais = doTipo.filter((c) => !c.paiId);
    return pais.flatMap((p) => [{ id: p.id, nome: p.nome }, ...doTipo.filter((c) => c.paiId === p.id).map((s) => ({ id: s.id, nome: `${p.nome} › ${s.nome}` }))]);
  }, [dados.cats, tipo]);

  const divisao: Divisao[] = dividir
    ? partes.filter((p) => p.pessoaId).map((p) => {
        const n = lerValor(p.txt) ?? 0;
        return { pessoaId: p.pessoaId, valor: modoDiv === "pct" ? Math.round((valor * n) / 10000) : n };
      })
    : [];
  const somaDiv = divisao.reduce((a, d) => a + d.valor, 0);

  async function salvar() {
    setErro("");
    try { localStorage.setItem("investmais-ultima-conta", contaId); } catch { /* sem armazenamento */ }
    if (!descricao.trim()) return setErro("Escreva uma descrição.");
    if (valor <= 0) return setErro("Informe um valor maior que zero.");
    if (!contaId) return setErro("Escolha a conta.");
    if (tipo === "transferencia" && (!contaDestinoId || contaDestinoId === contaId)) return setErro("Escolha uma conta de destino diferente da de origem.");
    if (dividir && somaDiv > valor) return setErro("A divisão entre pessoas passa do valor do lançamento.");
    if (mesFechado(dados.fech, data)) return setErro(`O mês de ${mesExtenso(mesDe(data))} está fechado. Reabra o mês em Mais › Fechamento para lançar nele.`);

    let fotoId = rascunho?.fotoId;
    if (foto) {
      fotoId = fotoId ?? novoId();
      await db.fotos.put({ id: fotoId, blob: foto });
    }
    if (!foto && fotoId) { await db.fotos.delete(fotoId); fotoId = undefined; }

    const base: Omit<Lancamento, "id" | "criadoEm"> = {
      tipo, descricao: descricao.trim(), valor, data, vencimento: vencimento || undefined, status,
      categoriaId: tipo === "transferencia" ? undefined : categoriaId || undefined,
      contaId, contaDestinoId: tipo === "transferencia" ? contaDestinoId : undefined,
      pessoaId: pessoaId || undefined, observacao: observacao.trim() || undefined, fotoId,
      divisao: divisao.length ? divisao : undefined,
    };

    if (editando) {
      await db.lancamentos.update(rascunho!.id!, { ...base, exemplo: false });
      aviso("Lançamento atualizado.");
      return fechar();
    }
    const n = Math.max(1, Math.min(120, Number(vezes) || 1));
    if (repetir === "nao" || n === 1) {
      await db.lancamentos.add({ ...base, id: novoId(), criadoEm: new Date().toISOString() });
      aviso("Lançamento salvo.");
      return fechar();
    }
    const grupo = novoId();
    const parcelado = repetir === "parcelado";
    const unit = parcelado ? Math.floor(valor / n) : valor;
    const sobra = parcelado ? valor - unit * n : 0;
    const itens: Lancamento[] = Array.from({ length: n }, (_, i) => ({
      ...base,
      id: novoId(),
      criadoEm: new Date().toISOString(),
      valor: unit + (i === 0 ? sobra : 0),
      data: somarMeses(data, i),
      vencimento: vencimento ? somarMeses(vencimento, i) : undefined,
      status: i === 0 ? status : "pendente",
      fotoId: i === 0 ? fotoId : undefined,
      divisao: i === 0 ? base.divisao : undefined,
      grupo,
      ...(parcelado ? { parcela: i + 1, totalParcelas: n } : { recorrente: true }),
    }));
    const fechadoNoMeio = itens.find((it) => mesFechado(dados.fech, it.data));
    if (fechadoNoMeio) return setErro(`Uma das repetições cai em ${mesExtenso(mesDe(fechadoNoMeio.data))}, que está fechado.`);
    await db.lancamentos.bulkAdd(itens);
    aviso(parcelado ? `${n} parcelas salvas.` : `Lançamento salvo para ${n} meses.`);
    fechar();
  }

  async function excluir(todos: boolean) {
    if (!rascunho?.id) return;
    if (todos && rascunho.grupo) {
      const ids = await db.lancamentos.where("grupo").equals(rascunho.grupo).filter((l) => !mesFechado(dados.fech, l.data) && l.data >= (rascunho.data ?? "")).primaryKeys();
      await db.lancamentos.bulkDelete(ids);
      aviso(`${ids.length} lançamento(s) excluído(s).`);
    } else {
      await db.lancamentos.delete(rascunho.id);
      if (rascunho.fotoId) await db.fotos.delete(rascunho.fotoId);
      aviso("Lançamento excluído.");
    }
    fechar();
  }

  const titulo = editando ? "Editar transação" : "Nova transação";
  return (
    <Folha titulo={titulo} aberta={!!rascunho} fechar={fechar}>
      {bloqueado && (
        <div className="aviso warn"><Lock /><div>Este lançamento é de {mesExtenso(mesDe(rascunho!.data!))}, que está fechado. Para editar, reabra o mês em Mais › Fechamento.</div></div>
      )}
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14, minWidth: 0 }}>
        <Seg rotulo="Tipo" valor={tipo} mudar={(t) => { setTipo(t); setCategoriaId(""); }} opcoes={[["despesa", "Despesa"], ["receita", "Receita"], ["transferencia", "Transferência"]]} />
        <Campo rotulo="Valor (R$)">
          <input className="valor-grande" inputMode="decimal" placeholder="0,00" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} id="f-valor" />
        </Campo>
        <Campo rotulo="Descrição"><input id="f-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Internet do escritório" maxLength={140} /></Campo>
        <div className="duas">
          <Campo rotulo="Data"><input id="f-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
          <Campo rotulo="Vencimento"><input id="f-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></Campo>
        </div>
        <Seg rotulo="Situação" valor={status} mudar={setStatus} opcoes={[["pago", tipo === "receita" ? "Recebido" : "Pago"], ["pendente", "Pendente"]]} />
        {tipo !== "transferencia" && (
          <Campo rotulo="Categoria">
            <select id="f-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sem categoria</option>
              {catsDoTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        )}
        <div className="duas">
          <Campo rotulo={tipo === "transferencia" ? "Da conta" : "Conta"}>
            <select id="f-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <optgroup label="Contas">{dados.contas.filter((c) => !ehCartao(c)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
              {dados.contas.some(ehCartao) && <optgroup label="Cartões de crédito">{dados.contas.filter(ehCartao).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.final ? ` •••• ${c.final}` : ""}</option>)}</optgroup>}
            </select>
          </Campo>
          {tipo === "transferencia" ? (
            <Campo rotulo="Para a conta">
              <select id="f-dest" value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)}>
                <option value="">Escolha</option>
                {dados.contas.filter((c) => c.id !== contaId).map((c) => <option key={c.id} value={c.id}>{ehCartao(c) ? `Cartão ${c.nome}` : c.nome}</option>)}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="Pessoa">
              <select id="f-pessoa" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
                <option value="">Nenhuma</option>
                {dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Campo>
          )}
        </div>

        {!editando && (
          <div className="card" style={{ padding: 12 }}>
            <Seg rotulo="Repetição" valor={repetir} mudar={setRepetir} opcoes={[["nao", "Uma vez"], ["parcelado", "Parcelado"], ["mensal", "Todo mês"]]} />
            {repetir !== "nao" && (
              <div className="duas" style={{ alignItems: "end" }}>
                <Campo rotulo={repetir === "parcelado" ? "Número de parcelas" : "Por quantos meses"}>
                  <input id="f-vezes" inputMode="numeric" value={vezes} onChange={(e) => setVezes(e.target.value.replace(/\D/g, ""))} />
                </Campo>
                <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>
                  {repetir === "parcelado"
                    ? `${Number(vezes) || 1}× de ${dinheiro(Math.floor(valor / (Number(vezes) || 1)))}`
                    : `${dinheiro(valor)} por mês`}
                </p>
              </div>
            )}
          </div>
        )}

        {tipo !== "transferencia" && dados.pessoas.length > 0 && (
          <div className="card" style={{ padding: 12 }}>
            <label className="chk"><input type="checkbox" checked={dividir} onChange={(e) => { setDividir(e.target.checked); if (e.target.checked && !partes.length) setPartes([{ pessoaId: "", txt: "" }]); }} />Dividir entre pessoas</label>
            {dividir && (
              <>
                <Seg rotulo="Dividir por" valor={modoDiv} mudar={setModoDiv} opcoes={[["valor", "Valor (R$)"], ["pct", "Porcentagem"]]} />
                {partes.map((p, i) => (
                  <div key={i} className="duas" style={{ gridTemplateColumns: "1fr 110px auto", alignItems: "center" }}>
                    <select aria-label="Pessoa" value={p.pessoaId} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, pessoaId: e.target.value } : x)))} className="btn" style={{ fontWeight: 600 }}>
                      <option value="">Pessoa</option>
                      {dados.pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                    <input aria-label={modoDiv === "pct" ? "Porcentagem" : "Valor"} inputMode="decimal" placeholder={modoDiv === "pct" ? "%" : "0,00"} value={p.txt} className="btn"
                      onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, txt: e.target.value } : x)))} />
                    <button type="button" className="btn icone fantasma" aria-label="Remover pessoa" onClick={() => setPartes(partes.filter((_, j) => j !== i))}><Trash2 /></button>
                  </div>
                ))}
                <div className="linha-botoes" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <button type="button" className="btn" onClick={() => setPartes([...partes, { pessoaId: "", txt: "" }])}>Adicionar pessoa</button>
                  <span className={`num ${somaDiv > valor ? "neg" : "muted"}`} style={{ fontSize: ".85rem" }}>
                    Dividido {dinheiro(somaDiv)} · fica {dinheiro(Math.max(0, valor - somaDiv))}
                  </span>
                </div>
                {divisao.map((d) => (
                  <div key={d.pessoaId} className="muted" style={{ fontSize: ".82rem" }}>
                    {dados.pessoas.find((x) => x.id === d.pessoaId)?.nome}: cabe {dinheiro(d.valor)}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <Campo rotulo="Observação"><textarea id="f-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} /></Campo>

        <div className="campo">
          <span>Foto anexada</span>
          {fotoUrl && <img src={fotoUrl} alt="Foto anexada ao lançamento" className="foto-previa" />}
          <div className="linha-botoes">
            <label className="btn"><Camera />{foto ? "Trocar foto" : "Anexar foto"}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setFoto(e.target.files[0])} />
            </label>
            {foto && <button type="button" className="btn fantasma" onClick={() => setFoto(undefined)}>Remover foto</button>}
          </div>
        </div>
      </fieldset>

      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      {!bloqueado && (
        <div className="linha-botoes" style={{ justifyContent: "space-between" }}>
          <div className="linha-botoes">
            {editando && <BotaoConfirmar confirmar="Toque de novo para excluir" onConfirm={() => excluir(false)}>Excluir</BotaoConfirmar>}
            {editando && rascunho?.grupo && <BotaoConfirmar confirmar="Confirmar: esta e as próximas" onConfirm={() => excluir(true)}>Excluir esta e as próximas</BotaoConfirmar>}
          </div>
          <button type="button" className="btn pri" onClick={salvar} style={{ minWidth: 140 }}>Salvar</button>
        </div>
      )}
    </Folha>
  );
}
