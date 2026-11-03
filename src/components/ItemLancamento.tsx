import { Lock, Paperclip, Repeat } from "lucide-react";
import { ehCartao, type Lancamento } from "../db";
import { mesFechado, situacao } from "../lib/calc";
import { dataCurta, dinheiro } from "../lib/format";
import { IconeCategoria, MASCARA, useDinheiro, type DadosApp } from "./ui";

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
