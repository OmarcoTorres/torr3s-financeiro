import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTransaction, Middleware } from "dexie";

/**
 * Fila de sincronização gravada na MESMA transação do IndexedDB que a mudança.
 * Antes, a fila era escrita depois do "complete": se o app fechasse entre os dois passos,
 * a mudança ficava só no aparelho e nunca subia. Aqui, ou grava as duas coisas, ou nenhuma.
 *
 * - Toda transação de escrita que toca uma tabela sincronizada passa a incluir a tabela da fila.
 * - Transações marcadas como remotas (dados que vieram do servidor) não geram fila.
 * - `config` só sincroniza a chave "perfil" (e só gravação, como antes).
 */
export interface OpcoesFila {
  tabelas: string[];           // tabelas cujos registros sobem (id = chave primária)
  fila: string;                // nome da tabela da fila
  marca: string;               // propriedade que marca a transação como remota
  ativa: () => boolean;        // só enfileira depois que a sincronização foi ligada
  aoConfirmar: () => void;     // chamado após o commit de uma transação que enfileirou algo
}

type Op = "put" | "del";

export function criarFilaMiddleware(o: OpcoesFila): Middleware<DBCore> {
  const rastreadas = new Set([...o.tabelas, "config"]);
  const avisadas = new WeakSet<object>();

  return {
    stack: "dbcore",
    name: "FilaSync",
    level: 1.5, // abaixo dos hooks do Dexie (recebe as operações já expandidas)
    create(down) {
      const remota = (t: DBCoreTransaction) => !!(t as unknown as Record<string, unknown>)[o.marca];

      const enfileirar = async (trans: DBCoreTransaction, tabela: string, ids: unknown[], op: Op) => {
        const lista = tabela === "config" ? (op === "put" ? ids.filter((id) => id === "perfil") : []) : ids;
        if (!lista.length) return;
        const nome = tabela === "config" ? "perfil" : tabela;
        const quando = Date.now();
        await down.table(o.fila).mutate({
          type: "put", trans,
          values: lista.map((id) => ({ chave: `${nome}:${String(id)}`, tabela: nome, id: String(id), op, quando })),
        });
        const idb = trans as unknown as EventTarget;
        if (!avisadas.has(idb) && typeof idb.addEventListener === "function") {
          avisadas.add(idb);
          idb.addEventListener("complete", () => o.aoConfirmar());
        }
      };

      return {
        ...down,
        transaction(stores, mode, opcoes) {
          const precisa = mode === "readwrite" && !stores.includes(o.fila) && stores.some((s) => rastreadas.has(s));
          return down.transaction(precisa ? [...stores, o.fila] : stores, mode, opcoes);
        },
        table(nome) {
          const tabela = down.table(nome);
          if (!rastreadas.has(nome)) return tabela;
          return {
            ...tabela,
            async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
              if (!o.ativa() || remota(req.trans)) return tabela.mutate(req);
              if (req.type === "deleteRange") {
                const { result } = await tabela.query({ trans: req.trans, values: false, query: { index: tabela.schema.primaryKey, range: req.range } });
                const res = await tabela.mutate(req);
                await enfileirar(req.trans, nome, result, "del");
                return res;
              }
              const res = await tabela.mutate(req);
              const falhou = (i: number) => !!res.failures?.[i];
              if (req.type === "delete") {
                await enfileirar(req.trans, nome, req.keys.filter((_, i) => !falhou(i)), "del");
              } else {
                const chaves = (req.keys ?? res.results ?? []).filter((k, i) => k != null && !falhou(i));
                await enfileirar(req.trans, nome, chaves, "put");
              }
              return res;
            },
          };
        },
      };
    },
  };
}
