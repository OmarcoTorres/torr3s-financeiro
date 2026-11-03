import { Lock, Paperclip, Repeat, Users } from "lucide-react";
import { ehCartao, type Compartilhado, type Lancamento } from "../db";
import { hoje, mesFechado, situacao } from "../lib/calc";
import { dataCurta, dinheiro } from "../lib/format";
import { IconeCategoria, MASCARA, useAviso, useDinheiro, type DadosApp } from "./ui";

const ROT = { pago: "pago", pendente: "pendente", atrasado: "atrasado" } as const;

export function ItemLancamento({ l, dados, abrir, mostrarData }: { l: Lancamento; dados: DadosApp; abrir: (l: Lancamento) => void; mostrarData?: boolean }) {
  const cat = dados.cats.find((c) => c.id === l.categoriaId);
  const pessoa = dados.pessoas.find((p) => p.id === l.pessoaId);
  const conta = dados.contas.find((c) => c.id === l.contaId);
  const destino = dados.contas.find((c) => c.id === l.contaDestinoId);
  const sit = situacao(l);
  const ocultar = useDinheiro();
  const sinal = l.tipo === "receita" ? "+" : l.tipo === "despesa" ? "-" : "";
  const cor = l.tipo === "receita" ? "pos" : l.tipo === "despesa" ? "" : "muted";
  return (
    <button type="button" className="item" onClick={() => abrir(l)}>
      <IconeCategoria icone={cat?.icone} cor={cat?.cor} transferencia={l.tipo === "transferencia"} />
      <div>
        <div className="tt">{l.descricao}{l.totalParcelas ? ` (${l.parcela}/${l.totalParcelas})` : ""}</div>
        <div className="meta">
          {mostrarData && <span>{dataCurta(l.data)}</span>}
          <span>{l.tipo === "transferencia" ? `${conta?.nome ?? "?"} → ${destino?.nome ?? "?"}` : cat?.nome ?? "Sem categoria"}</span>
          {conta && ehCartao(conta) && l.tipo !== "transferencia" && <span>· {conta.nome}{conta.final ? ` •••• ${conta.final}` : ""}</span>}
          {pessoa && <span>· {pessoa.nome}</span>}
          {l.vencimento && l.status === "pendente" && <span>· vence {dataCurta(l.vencimento)}</span>}
          {l.compartilhado && <Users size={12} aria-label="Compartilhado com o grupo" />}
          {l.recorrente && <Repeat size={12} aria-label="Mensal" />}
          {l.fotoId && <Paperclip size={12} aria-label="Com foto" />}
          {mesFechado(dados.fech, l.data) && <Lock size={12} aria-label="Mês fechado" />}
          {l.exemplo && <span className="pill ex">exemplo</span>}
        </div>
      </div>
      <div className="val">
        <span className={`num ${cor}`}>{ocultar(l.valor) === MASCARA ? MASCARA : `${sinal}${dinheiro(l.valor)}`}</span>
        <span className={`pill ${sit}`}>{ROT[sit]}</span>
      </div>
    </button>
  );
}

/** Lançamento que alguém do grupo compartilhou: só leitura, com o nome de quem lançou. */
export function ItemCompartilhado({ c, mostrarData }: { c: Compartilhado; mostrarData?: boolean }) {
  const aviso = useAviso();
  const ocultar = useDinheiro();
  const sit = c.status === "pago" ? "pago" : (c.vencimento ?? c.data) < hoje() ? "atrasado" : "pendente";
  const sinal = c.tipo === "receita" ? "+" : c.tipo === "despesa" ? "-" : "";
  return (
    <button type="button" className="item" onClick={() => aviso(`Lançado por ${c.autorNome.split(" ")[0]}. Só quem lançou pode editar.`)}>
      <span className="ic" style={{ background: `color-mix(in srgb, ${c.categoriaCor ?? "#6e7391"} 15%, var(--surface))`, color: c.categoriaCor ?? "var(--muted)", fontWeight: 700 }}>{c.autorNome.slice(0, 1).toUpperCase()}</span>
      <div>
        <div className="tt">{c.descricao}</div>
        <div className="meta">
          {mostrarData && <span>{dataCurta(c.data)}</span>}
          <span>{c.categoriaNome ?? "Sem categoria"}</span>
          <span className="pill pendente" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>de {c.autorNome.split(" ")[0]}</span>
        </div>
      </div>
      <div className="val">
        <span className={`num ${c.tipo === "receita" ? "pos" : ""}`}>{ocultar(c.valor) === MASCARA ? MASCARA : `${sinal}${dinheiro(c.valor)}`}</span>
        <span className={`pill ${sit}`}>{sit}</span>
      </div>
    </button>
  );
}

