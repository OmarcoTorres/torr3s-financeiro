import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { db, novoId, type Lancamento, type Pessoa, type TipoPessoa } from "../db";
import { saldoPessoa } from "../lib/calc";
import { dataCurta, dinheiro } from "../lib/format";
import { ItemCompartilhado, ItemLancamento } from "../components/ItemLancamento";
import { BotaoConfirmar, Campo, Folha, useAviso, type DadosApp } from "../components/ui";
import { InputNome, InputTelefone } from "../components/campos";

export const TIPOS_PESSOA: [TipoPessoa, string][] = [["cliente", "Cliente"], ["fornecedor", "Fornecedor"], ["socio", "Sócio"], ["funcionario", "Funcionário"], ["outro", "Outro"]];
const nomeTipo = (t: TipoPessoa) => TIPOS_PESSOA.find(([k]) => k === t)?.[1] ?? t;

const normal = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const primeiro = (n: string) => normal(n).split(/\s+/)[0] ?? "";

/** Junta `origem` em `destino`: os lançamentos (e divisões) passam para o destino e a origem é apagada. */
export async function juntarPessoas(origem: Pessoa, destino: Pessoa) {
  await db.transaction("rw", db.pessoas, db.lancamentos, async () => {
    await db.lancamentos.where("pessoaId").equals(origem.id).modify((l) => { l.pessoaId = destino.id; });
    await db.lancamentos.filter((l) => !!l.divisao?.some((d) => d.pessoaId === origem.id))
      .modify((l) => { l.divisao = l.divisao?.map((d) => (d.pessoaId === origem.id ? { ...d, pessoaId: destino.id } : d)); });
    await db.pessoas.update(destino.id, {
      telefone: destino.telefone || origem.telefone,
      observacao: [destino.observacao, origem.observacao].filter(Boolean).join(" · ") || undefined,
    });
    await db.pessoas.delete(origem.id);
  });
}

/** Pessoa cadastrada à mão com o mesmo nome de alguém do grupo: provável duplicata. */
function duplicatasDoGrupo(pessoas: Pessoa[]) {
  const doGrupo = pessoas.filter((p) => p.userId);
  return pessoas.filter((p) => !p.userId && !p.exemplo).flatMap((p) => {
    const alvo = doGrupo.find((g) => normal(g.nome) === normal(p.nome)) ?? doGrupo.find((g) => primeiro(g.nome) === primeiro(p.nome));
    return alvo ? [{ origem: p, destino: alvo }] : [];
  });
}

export function Pessoas({ dados, abrir }: { dados: DadosApp; abrir: (l: Lancamento) => void }) {
  const aviso = useAviso();
  const duplicadas = duplicatasDoGrupo(dados.pessoas);
  const [ficha, setFicha] = useState<Pessoa | null>(null);
  const [editar, setEditar] = useState<Partial<Pessoa> | null>(null);
  const [busca, setBusca] = useState("");
  const lista = dados.pessoas
    .filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    .map((p) => ({ p, s: saldoPessoa(p, dados.lanc) }))
    .sort((a, b) => a.p.nome.localeCompare(b.p.nome));

  return (
    <>
      <div className="busca">
        <input className="entrada" type="search" placeholder="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pessoa" id="busca-pessoa" />
        <button type="button" className="btn pri" onClick={() => setEditar({ tipo: "cliente" })}><UserPlus />Nova</button>
      </div>
      {duplicadas.map(({ origem, destino }) => {
        const n = dados.lanc.filter((l) => l.pessoaId === origem.id || l.divisao?.some((d) => d.pessoaId === origem.id)).length;
        return (
          <div key={origem.id} className="aviso warn" role="status">
            <Users />
            <div>
              <b>{destino.nome.split(" ")[0]} aparece duas vezes.</b> Uma é a do seu grupo (ligada ao app dela) e a outra, “{origem.nome}”, foi cadastrada à mão{n ? ` e tem ${n} lançamento${n === 1 ? "" : "s"}` : ""}.
              <div className="linha-botoes">
                <button type="button" className="btn pri" onClick={async () => { await juntarPessoas(origem, destino); aviso(`Pronto: ficou uma ${destino.nome.split(" ")[0]} só${n ? `, com os ${n} lançamento${n === 1 ? "" : "s"}` : ""}.`); }}>Juntar</button>
              </div>
            </div>
          </div>
        );
      })}
      <section className="card" style={{ gap: 0 }}>
        {lista.length === 0 ? (
          <div className="vazio"><Users /><div>Nenhuma pessoa cadastrada. Cadastre clientes, fornecedores e sócios para ver quanto cada um deve.</div></div>
        ) : lista.map(({ p, s }) => (
          <button type="button" key={p.id} className="item" style={{ gridTemplateColumns: "38px 1fr auto" }} onClick={() => setFicha(p)}>
            <span className="ic" style={{ background: "var(--surface-2)", color: "var(--ink)", fontWeight: 800 }}>{p.nome.slice(0, 1).toUpperCase()}</span>
            <div><div className="tt">{p.nome}</div><div className="meta"><span>{p.userId ? "do seu grupo" : nomeTipo(p.tipo)}</span>{p.exemplo && <span className="pill ex">exemplo</span>}</div></div>
            <div className="val">
              {s.liquido === 0 ? <span className="muted" style={{ fontSize: ".82rem" }}>sem pendências</span> : (
                <>
                  <span className={`num ${s.liquido > 0 ? "pos" : "neg"}`}>{dinheiro(Math.abs(s.liquido))}</span>
                  <span className="muted" style={{ fontSize: ".72rem", fontWeight: 600 }}>{s.liquido > 0 ? "deve a você" : "você deve"}</span>
                </>
              )}
            </div>
          </button>
        ))}
      </section>

      {ficha && <Ficha p={dados.pessoas.find((x) => x.id === ficha.id) ?? ficha} dados={dados} fechar={() => setFicha(null)} abrir={(l) => { setFicha(null); abrir(l); }} editar={() => { setEditar(ficha); setFicha(null); }} />}
      <EditarPessoa p={editar} fechar={() => setEditar(null)} dados={dados} />
    </>
  );
}

function Ficha({ p, dados, fechar, abrir, editar }: { p: Pessoa; dados: DadosApp; fechar: () => void; abrir: (l: Lancamento) => void; editar: () => void }) {
  const s = saldoPessoa(p, dados.lanc);
  const hist = [...s.dela].sort((a, b) => b.data.localeCompare(a.data));
  return (
    <Folha titulo={p.nome} aberta fechar={fechar} acoes={<button type="button" className="btn" onClick={editar}>Editar</button>}>
      <div className="muted" style={{ marginTop: -8 }}>{nomeTipo(p.tipo)}{p.telefone ? ` · ${p.telefone}` : ""}</div>
      {p.observacao && <p style={{ margin: 0 }}>{p.observacao}</p>}
      <div className="grade">
        <div className="card kpi"><span className="k">Deve a você</span><span className="v num pos">{dinheiro(s.aReceber)}</span></div>
        <div className="card kpi"><span className="k">Você deve a ela</span><span className="v num neg">{dinheiro(s.aPagar)}</span></div>
        <div className="card kpi"><span className="k">Saldo líquido</span><span className={`v num ${s.liquido >= 0 ? "pos" : "neg"}`}>{dinheiro(s.liquido)}</span></div>
      </div>
      {s.divisoes.length > 0 && (
        <div className="card">
          <h2>Parte em lançamentos divididos · {dinheiro(s.parteDividida)}</h2>
          {s.divisoes.map(({ l, valor }) => (
            <div key={l.id} className="cab" style={{ fontSize: ".88rem" }}><span>{dataCurta(l.data)} · {l.descricao} (total {dinheiro(l.valor)})</span><b className="num">{dinheiro(valor)}</b></div>
          ))}
        </div>
      )}
      {p.userId && (
        <>
          <div className="aviso dica"><Users size={18} /><div><b>Do seu grupo no Invest+.</b> Abaixo, o que {p.nome.split(" ")[0]} compartilhou com você.</div></div>
          {(() => {
            const dela = dados.compartilhados.filter((c) => c.autorId === p.userId).sort((a, b) => b.data.localeCompare(a.data));
            return dela.length ? <div className="lista">{dela.slice(0, 30).map((c) => <ItemCompartilhado key={c.id} c={c} mostrarData />)}</div>
              : <p className="muted" style={{ margin: 0 }}>Nada compartilhado ainda.</p>;
          })()}
        </>
      )}
      <h2 style={{ fontSize: "1rem" }}>{p.userId ? "Seus lançamentos com esta pessoa" : "Histórico"}</h2>
      {hist.length ? <div className="lista">{hist.map((l) => <ItemLancamento key={l.id} l={l} dados={dados} abrir={abrir} mostrarData />)}</div> : <p className="muted" style={{ margin: 0 }}>Nenhum lançamento com esta pessoa.</p>}
    </Folha>
  );
}

function EditarPessoa({ p, fechar, dados }: { p: Partial<Pessoa> | null; fechar: () => void; dados: DadosApp }) {
  const aviso = useAviso();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoPessoa>("cliente");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [carregado, setCarregado] = useState<Partial<Pessoa> | null>(null);
  if (p !== carregado) {
    setCarregado(p);
    setNome(p?.nome ?? ""); setTipo(p?.tipo ?? "cliente"); setTelefone(p?.telefone ?? ""); setObs(p?.observacao ?? "");
  }
  const usos = p?.id ? dados.lanc.filter((l) => l.pessoaId === p.id || l.divisao?.some((d) => d.pessoaId === p.id)).length : 0;

  async function salvar() {
    if (!nome.trim()) { aviso("Escreva o nome."); return; }
    // Mantém o que a tela não mostra (ex.: userId da pessoa do grupo, que liga ao app dela).
    const reg: Pessoa = { ...(p as Pessoa), id: p?.id ?? novoId(), nome: nome.trim(), tipo, telefone: telefone.trim() || undefined, observacao: obs.trim() || undefined };
    await db.pessoas.put(reg);
    aviso(p?.id ? "Pessoa atualizada." : "Pessoa cadastrada.");
    fechar();
  }
  async function excluir() {
    if (!p?.id) return;
    await db.transaction("rw", db.pessoas, db.lancamentos, async () => {
      await db.lancamentos.where("pessoaId").equals(p.id!).modify((l) => { delete l.pessoaId; });
      await db.lancamentos.filter((l) => !!l.divisao?.some((d) => d.pessoaId === p.id)).modify((l) => { l.divisao = l.divisao?.filter((d) => d.pessoaId !== p.id); });
      await db.pessoas.delete(p.id!);
    });
    aviso("Pessoa excluída. Os lançamentos continuam, sem a pessoa.");
    fechar();
  }

  return (
    <Folha titulo={p?.id ? "Editar pessoa" : "Nova pessoa"} aberta={!!p} fechar={fechar}>
      <Campo rotulo="Nome"><InputNome id="pe-nome" value={nome} onChange={setNome} maxLength={100} /></Campo>
      <Campo rotulo="Tipo"><select id="pe-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPessoa)}>{TIPOS_PESSOA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Campo>
      <Campo rotulo="Telefone"><InputTelefone id="pe-tel" value={telefone} onChange={setTelefone} placeholder="(11) 99999-0000" /></Campo>
      <Campo rotulo="Observação"><textarea id="pe-obs" value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      <div className="linha-botoes" style={{ justifyContent: "space-between" }}>
        {p?.id ? <BotaoConfirmar confirmar={usos ? `Excluir mesmo? (${usos} lançamento(s) ficam sem pessoa)` : "Toque de novo para excluir"} onConfirm={excluir}>Excluir</BotaoConfirmar> : <span />}
        <button type="button" className="btn pri" onClick={salvar}>Salvar</button>
      </div>
    </Folha>
  );
}
