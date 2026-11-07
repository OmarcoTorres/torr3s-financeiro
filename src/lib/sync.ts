import Dexie from "dexie";
import { useSyncExternalStore } from "react";
import { db, type Compartilhado, type Perfil } from "../db";
import { supabase } from "./supabase";
import { desligarPushAoSair } from "./push";
import { LIMITE_FOTO, prepararFoto } from "./foto";

/**
 * Sincronização com o Supabase.
 * O app continua lendo e gravando no banco local (IndexedDB) — rápido e funciona sem internet.
 * Cada mudança local entra numa fila; a fila é enviada ao servidor, e as mudanças do servidor
 * (feitas em outro aparelho ou pela outra pessoa do espaço) são baixadas pelo carimbo atualizado_em.
 */

type Campo = string;
const TABELAS: Record<string, { campos: Campo[]; chaveLocal?: string }> = {
  contas: { campos: ["id", "nome", "saldoInicial", "cor", "tipo", "limite", "vencimentoDia", "final", "compartilhada"] },
  categorias: { campos: ["id", "nome", "tipo", "cor", "icone", "paiId"] },
  pessoas: { campos: ["id", "nome", "tipo", "telefone", "observacao", "userId"] },
  lancamentos: { campos: ["id", "tipo", "descricao", "valor", "data", "vencimento", "categoriaId", "contaId", "contaDestinoId", "pessoaId", "status", "observacao", "fotoId", "grupo", "parcela", "totalParcelas", "recorrente", "divisao", "compartilhado", "criadoEm"] },
  metas: { campos: ["id", "nome", "alvo", "guardado", "prazo", "icone", "cor", "aportes", "criadoEm"] },
  fechamentos: { campos: ["mes", "fechadoEm", "resumo"], chaveLocal: "mes" },
  relatorios: { campos: ["id", "nome", "config"] },
};
const NOMES = Object.keys(TABELAS);
/** Colunas obrigatórias no servidor: um campo vazio no aparelho não pode travar o envio. */
const PADROES: Record<string, Record<string, unknown>> = {
  contas: { saldo_inicial: 0, cor: "#5b5bd6", tipo: "conta", compartilhada: false },
  categorias: { cor: "#8b8fa3", icone: "tag" },
  pessoas: { tipo: "outro" },
  lancamentos: { descricao: "(sem descrição)", status: "pago", compartilhado: false },
  metas: { guardado: 0, icone: "piggy", cor: "#5b5bd6", aportes: [] },
  fechamentos: { resumo: {} },
  relatorios: { config: {} },
};
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function paraServidor(tabela: string, espaco: string, obj: Record<string, unknown>) {
  const t = TABELAS[tabela];
  const linha: Record<string, unknown> = { espaco_id: espaco, excluido: false };
  for (const c of t.campos) {
    const col = c === t.chaveLocal ? "id" : snake(c);
    linha[col] = obj[c] ?? null;
  }
  for (const [col, v] of Object.entries(PADROES[tabela] ?? {})) if (linha[col] === null || linha[col] === "") linha[col] = v;
  if (typeof linha.valor === "number") linha.valor = Math.round(Math.abs(linha.valor));
  if (tabela === "lancamentos" && !linha.criado_em) linha.criado_em = new Date().toISOString();
  return linha;
}

function paraLocal(tabela: string, linha: Record<string, unknown>) {
  const t = TABELAS[tabela];
  const obj: Record<string, unknown> = {};
  for (const c of t.campos) {
    const v = linha[c === t.chaveLocal ? "id" : snake(c)];
    if (v !== null && v !== undefined) obj[c] = v;
  }
  return obj;
}

// ---------- Estado observável (para o indicador na tela) ----------
export type StatusSync = "desligado" | "sincronizando" | "ok" | "offline" | "erro";
let estado: { status: StatusSync; erro?: string; espacoId?: string; pendentes: number; recusados?: number; ultimaSync?: number } = { status: "desligado", pendentes: 0 };
const ouvintes = new Set<() => void>();
function mudar(p: Partial<typeof estado>) { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()); }
export const useSync = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);

// ---------- Fila de mudanças locais ----------
const MARCA_REMOTA = "__invest_remoto";
const ehRemota = (trans: unknown) => !!(trans as Record<string, unknown> | undefined)?.[MARCA_REMOTA];
let agendado: number | undefined;
function agendarEnvio() { window.clearTimeout(agendado); agendado = window.setTimeout(() => void ciclo(), 1200); }

async function enfileirar(tabela: string, id: string, op: "put" | "del") {
  await db.fila.put({ chave: `${tabela}:${id}`, tabela, id, op, quando: Date.now() });
  mudar({ pendentes: await db.fila.count() });
  agendarEnvio();
}

let ganchosInstalados = false;
function instalarGanchos() {
  if (ganchosInstalados) return;
  ganchosInstalados = true;
  for (const nome of [...NOMES, "fotos"]) {
    const tabela = db.table(nome);
    const chave = (pk: unknown, obj?: Record<string, unknown>) => String(pk ?? obj?.[TABELAS[nome]?.chaveLocal ?? "id"]);
    tabela.hook("creating", function (pk, obj, trans) { if (!ehRemota(trans)) trans.on("complete", () => void enfileirar(nome, chave(pk, obj as Record<string, unknown>), "put")); });
    tabela.hook("updating", function (_m, pk, _obj, trans) { if (!ehRemota(trans)) trans.on("complete", () => void enfileirar(nome, chave(pk), "put")); });
    tabela.hook("deleting", function (pk, _obj, trans) { if (!ehRemota(trans)) trans.on("complete", () => void enfileirar(nome, chave(pk), "del")); });
  }
  db.config.hook("creating", function (pk, _obj, trans) { if (pk === "perfil" && !ehRemota(trans)) trans.on("complete", () => void enfileirar("perfil", "perfil", "put")); });
  db.config.hook("updating", function (_m, pk, _obj, trans) { if (pk === "perfil" && !ehRemota(trans)) trans.on("complete", () => void enfileirar("perfil", "perfil", "put")); });
}

/** Grava no banco local sem gerar nova ida ao servidor (dados que vieram de lá). */
async function aplicarRemoto(tabelas: string[], fn: () => Promise<void>) {
  await db.transaction("rw", tabelas.map((t) => db.table(t)), async () => {
    const t = Dexie.currentTransaction as unknown as Record<string, unknown>;
    t[MARCA_REMOTA] = true;
    await fn();
  });
}

// ---------- Envio ----------
/** Falha de rede (sem resposta do servidor) x recusa do servidor para um item específico. */
function ehFalhaDeRede(e: unknown) {
  const x = e as { code?: string; status?: number; statusCode?: string; message?: string } | undefined;
  if (/fetch|network|load failed|abort|timed? ?out|conex/i.test(String(x?.message ?? ""))) return true;
  return !x?.code && !x?.status && !x?.statusCode;
}
const textoErro = (e: unknown) => String((e as { message?: string })?.message ?? e).slice(0, 200);

/**
 * Envia a fila. Um item que o servidor recusa fica marcado com o erro e continua na fila,
 * mas não impede os outros de subirem. Falha de rede interrompe e tenta de novo na próxima rodada.
 */
async function enviar(espaco: string, userId: string) {
  const itens = await db.fila.toArray();
  if (!itens.length) return;
  const versao = new Map(itens.map((i) => [i.chave, i.quando]));
  const ok: string[] = [];
  const falhas = new Map<string, string>();
  const recusado = (chave: string, e: unknown) => { if (ehFalhaDeRede(e)) throw e; falhas.set(chave, textoErro(e)); };

  for (const nome of [...NOMES, "fotos", "perfil"]) {
    const doNome = itens.filter((i) => i.tabela === nome);
    if (!doNome.length) continue;
    if (nome === "perfil") {
      const p = (await db.config.get("perfil"))?.valor as Perfil | undefined;
      if (p) {
        const idade = p.idade && p.idade >= 12 && p.idade <= 110 ? p.idade : null;
        const { error } = await supabase.from("perfis").upsert({
          user_id: userId, nome: p.nome || "Você", idade, uso: p.uso || "pessoal", empresa: p.empresa ?? null,
          objetivo: p.objetivo || "organizar", meta: p.meta ?? null, espaco_atual: espaco, criado_em: p.criadoEm,
        });
        if (error) { recusado("perfil:perfil", error); continue; }
      }
      ok.push("perfil:perfil");
      continue;
    }
    const puts = doNome.filter((i) => i.op === "put").map((i) => i.id);
    const dels = doNome.filter((i) => i.op === "del").map((i) => i.id);
    if (nome === "fotos") {
      for (const id of puts) {
        const f = await db.fotos.get(id);
        if (!f) { dels.push(id); continue; }
        // Foto guardada antes da compressão automática: reduz aqui para não esbarrar no limite do servidor.
        if (f.blob.size > LIMITE_FOTO) {
          try {
            const menor = await prepararFoto(f.blob);
            await aplicarRemoto(["fotos"], async () => { await db.fotos.put({ id, blob: menor }); });
            f.blob = menor;
          } catch (e) { falhas.set(`fotos:${id}`, textoErro(e)); continue; }
        }
        const caminho = `${espaco}/${id}.jpg`;
        const up = await supabase.storage.from("fotos").upload(caminho, f.blob, { upsert: true, contentType: f.blob.type || "image/jpeg" });
        if (up.error) { recusado(`fotos:${id}`, up.error); continue; }
        const { error } = await supabase.from("fotos").upsert({ espaco_id: espaco, id, caminho, excluido: false });
        if (error) { recusado(`fotos:${id}`, error); continue; }
        ok.push(`fotos:${id}`);
      }
      if (dels.length) {
        await supabase.storage.from("fotos").remove(dels.map((id) => `${espaco}/${id}.jpg`));
        const { error } = await supabase.from("fotos").update({ excluido: true }).eq("espaco_id", espaco).in("id", dels);
        if (error) throw error;
        ok.push(...dels.map((id) => `fotos:${id}`));
      }
      continue;
    }
    if (puts.length) {
      const locais = await db.table(nome).bulkGet(puts);
      const linhas: Record<string, unknown>[] = [];
      locais.forEach((o, i) => (o ? linhas.push(paraServidor(nome, espaco, o)) : dels.push(puts[i])));
      for (let i = 0; i < linhas.length; i += 500) {
        const lote = linhas.slice(i, i + 500);
        const { error } = await supabase.from(nome).upsert(lote, { onConflict: "espaco_id,id" });
        if (!error) { ok.push(...lote.map((l) => `${nome}:${l.id}`)); continue; }
        if (ehFalhaDeRede(error)) throw error;
        // O lote foi recusado: manda um a um para achar o item com problema e deixar os outros subirem.
        for (const l of lote) {
          const r = await supabase.from(nome).upsert(l, { onConflict: "espaco_id,id" });
          if (r.error) recusado(`${nome}:${l.id}`, r.error);
          else ok.push(`${nome}:${l.id}`);
        }
      }
    }
    if (dels.length) {
      const { error } = await supabase.from(nome).update({ excluido: true }).eq("espaco_id", espaco).in("id", dels);
      if (error) throw error;
      ok.push(...dels.map((id) => `${nome}:${id}`));
    }
  }

  // Tira da fila só o que subiu e não mudou de novo durante o envio; marca o erro nos recusados.
  await db.transaction("rw", db.fila, async () => {
    const atuais = await db.fila.bulkGet(ok);
    await db.fila.bulkDelete(atuais.filter((a) => a && a.quando === versao.get(a.chave)).map((a) => a!.chave));
    for (const [chave, erro] of falhas) await db.fila.update(chave, { erro });
  });
  mudar({ pendentes: await db.fila.count() });
  if (falhas.size) console.warn("itens recusados pelo servidor", Object.fromEntries(falhas));
}

// ---------- Recebimento ----------
const chaveCursor = (espaco: string, t: string) => `cursor:${espaco}:${t}`;
async function receber(espaco: string) {
  for (const nome of [...NOMES, "fotos"]) {
    const desde = ((await db.config.get(chaveCursor(espaco, nome)))?.valor as string | undefined) ?? "1970-01-01T00:00:00Z";
    // Margem de 5 s para não perder gravações concorrentes; reaplicar é inofensivo.
    const margem = new Date(new Date(desde).getTime() - 5000).toISOString();
    let maior = desde;
    for (let pagina = 0; pagina < 50; pagina++) {
      const { data, error } = await supabase.from(nome).select("*").eq("espaco_id", espaco).gt("atualizado_em", margem)
        .order("atualizado_em", { ascending: true }).range(pagina * 1000, pagina * 1000 + 999);
      if (error) throw error;
      if (!data?.length) break;
      // Não sobrescreve o que ainda está na fila local (mudança deste aparelho ainda não enviada).
      const pendentes = new Set((await db.fila.where("chave").startsWith(`${nome}:`).toArray()).map((i) => i.id));
      const linhas = data.filter((l) => !pendentes.has(String(l.id)));
      if (nome === "fotos") {
        for (const l of linhas) {
          if (l.excluido) { await aplicarRemoto(["fotos"], async () => { await db.fotos.delete(l.id); }); continue; }
          if (await db.fotos.get(l.id)) continue;
          const dl = await supabase.storage.from("fotos").download(l.caminho);
          if (!dl.error && dl.data) await aplicarRemoto(["fotos"], async () => { await db.fotos.put({ id: l.id, blob: dl.data }); });
        }
      } else {
        await aplicarRemoto([nome], async () => {
          const tabela = db.table(nome);
          const apagar = linhas.filter((l) => l.excluido).map((l) => l.id);
          const gravar = linhas.filter((l) => !l.excluido).map((l) => paraLocal(nome, l));
          if (apagar.length) await tabela.bulkDelete(apagar);
          if (gravar.length) await tabela.bulkPut(gravar);
        });
      }
      maior = data[data.length - 1].atualizado_em;
      if (data.length < 1000) break;
    }
    if (maior !== desde) await db.config.put({ chave: chaveCursor(espaco, nome), valor: maior });
  }
}

// ---------- Compartilhados pelo grupo (só leitura) ----------
async function receberCompartilhados(userId: string) {
  const chave = `cursor:compartilhados:${userId}`;
  const desde = ((await db.config.get(chave))?.valor as string | undefined) ?? "1970-01-01T00:00:00Z";
  const margem = new Date(new Date(desde).getTime() - 5000).toISOString();
  const { data, error } = await supabase.rpc("compartilhados_desde", { p_desde: margem });
  if (error) { if (/compartilhados_desde/.test(error.message)) return; throw error; } // banco ainda sem a migração 0005
  const linhas = (data ?? []) as Record<string, unknown>[];
  if (!linhas.length) return;
  await db.transaction("rw", db.compartilhados, db.config, async () => {
    const sair = linhas.filter((l) => !l.visivel).map((l) => String(l.id));
    const entrar = linhas.filter((l) => l.visivel).map((l) => ({
      id: String(l.id), autorId: String(l.autor_id), autorNome: String(l.autor_nome), tipo: l.tipo as Compartilhado["tipo"],
      descricao: String(l.descricao ?? ""), valor: Number(l.valor ?? 0), data: String(l.data), vencimento: (l.vencimento as string) || undefined,
      status: l.status as Compartilhado["status"], categoriaNome: (l.categoria_nome as string) || undefined, categoriaCor: (l.categoria_cor as string) || undefined, contaNome: (l.conta_nome as string) || undefined,
      observacao: (l.observacao as string) || undefined, atualizadoEm: String(l.atualizado_em),
    }));
    if (sair.length) await db.compartilhados.bulkDelete(sair);
    if (entrar.length) await db.compartilhados.bulkPut(entrar);
    await db.config.put({ chave, valor: String(linhas[linhas.length - 1].atualizado_em) });
  });
}

/** Ao sair do grupo com alguém: some com o que essa pessoa tinha compartilhado. */
export async function esquecerCompartilhadosDe(autorId: string) {
  const ids = await db.compartilhados.where("autorId").equals(autorId).primaryKeys();
  await db.compartilhados.bulkDelete(ids);
}

// ---------- Convite para o grupo ----------
const CHAVE_CONVITE = "investmais-convite";
/** Guarda o código que veio no link (?convite=...) até a pessoa terminar o cadastro. */
export function capturarConviteDaUrl() {
  const u = new URL(location.href);
  const c = u.searchParams.get("convite");
  if (!c) return;
  try { localStorage.setItem(CHAVE_CONVITE, c.trim().toUpperCase()); } catch { /* sem armazenamento */ }
  u.searchParams.delete("convite");
  history.replaceState(null, "", u.pathname + u.hash);
}
export function convitePendente() { try { return localStorage.getItem(CHAVE_CONVITE); } catch { return null; } }
export function limparConvitePendente() { try { localStorage.removeItem(CHAVE_CONVITE); } catch { /* ignora */ } }

/** Aceita um convite de grupo; devolve o nome de quem convidou. */
export async function aceitarConviteGrupo(codigo: string) {
  const { data, error } = await supabase.rpc("aceitar_convite_grupo", { p_codigo: codigo.trim().toUpperCase() });
  if (error) throw new Error(/aceitar_convite_grupo/.test(error.message) ? "Falta atualizar o banco (migração 0005)." : error.message);
  limparConvitePendente();
  await ciclo();
  return String(data ?? "Alguém");
}

// ---------- Ciclo e início ----------
let sessao: { espaco: string; userId: string } | null = null;
let rodando = false;
let relogio: number | undefined;
let rodada = 0;
let usuarioAtual: string | null = null;

let inicioRodada = 0;

async function ciclo() {
  if (!sessao) { void religar(); return; }
  // Rodada presa há mais de 3 min (app suspenso no meio do envio): libera para tentar de novo.
  if (rodando && Date.now() - inicioRodada < 180_000) return;
  if (!navigator.onLine) { mudar({ status: "offline" }); return; }
  const minha = ++rodada;
  rodando = true; inicioRodada = Date.now();
  mudar({ status: "sincronizando" });
  try {
    await enviar(sessao.espaco, sessao.userId);
    await receber(sessao.espaco);
    await receberCompartilhados(sessao.userId);
    if (minha !== rodada) return;
    const recusados = (await db.fila.toArray()).filter((i) => i.erro);
    if (recusados.length) mudar({ status: "erro", recusados: recusados.length, erro: `${recusados.length} ${recusados.length === 1 ? "item não subiu" : "itens não subiram"} (${recusados[0].erro})` });
    else mudar({ status: "ok", erro: undefined, recusados: 0, ultimaSync: Date.now() });
  } catch (e) {
    console.error("sincronização", e);
    if (minha === rodada) mudar({ status: navigator.onLine && !ehFalhaDeRede(e) ? "erro" : "offline", erro: textoErro(e) });
  } finally {
    if (minha === rodada) rodando = false;
  }
}
export const sincronizarAgora = () => ciclo();

/** Texto para o usuário (sem jargão de banco); o erro técnico fica só em "Detalhes". */
export function explicarSync(s: typeof estado): { titulo: string; texto: string; tom: "ok" | "warn" | "neg" | "neutro" } {
  const n = s.pendentes;
  const mudancas = `${n} ${n === 1 ? "mudança" : "mudanças"}`;
  if (s.status === "ok") return { titulo: "Tudo salvo na nuvem", texto: "Seus dados estão iguais em todos os aparelhos.", tom: "ok" };
  if (s.status === "sincronizando") return { titulo: "Sincronizando…", texto: n ? `Enviando ${mudancas} deste aparelho.` : "Buscando novidades dos outros aparelhos.", tom: "neutro" };
  if (s.status === "offline") return { titulo: "Sem internet agora", texto: n ? `${mudancas} guardada${n === 1 ? "" : "s"} neste aparelho. Sobe${n === 1 ? "" : "m"} sozinha${n === 1 ? "" : "s"} quando a conexão voltar.` : "Pode continuar usando: o que você lançar sobe quando a conexão voltar.", tom: "warn" };
  if (s.status === "erro") {
    if (/jwt|token|401|PGRST301/i.test(s.erro ?? "")) return { titulo: "Sua sessão expirou", texto: "Saia e entre de novo na sua conta. Nada do que está no aparelho se perde.", tom: "neg" };
    if (s.recusados) return { titulo: `${s.recusados} ${s.recusados === 1 ? "item ainda não subiu" : "itens ainda não subiram"}`, texto: "Continuam guardados neste aparelho e o app tenta de novo sozinho. O resto já está salvo na nuvem.", tom: "neg" };
    return { titulo: "Não deu para sincronizar", texto: "O app tenta de novo sozinho em alguns segundos. Seus dados continuam guardados neste aparelho.", tom: "neg" };
  }
  return { titulo: "Sincronização desligada", texto: "Entre na sua conta para guardar os dados na nuvem.", tom: "neutro" };
}

const TABELAS_DADOS = [...NOMES, "fotos"];
async function limparDadosLocais() {
  await aplicarRemoto([...TABELAS_DADOS, "fila"], async () => {
    for (const t of [...TABELAS_DADOS, "fila"]) await db.table(t).clear();
  });
}
async function contarLocal() {
  let n = 0;
  for (const t of NOMES) n += await db.table(t).count();
  return n;
}

/**
 * Liga a sincronização para o usuário logado.
 * Primeira vez neste aparelho e espaço: se o servidor está vazio e o aparelho tem dados, envia tudo
 * (é assim que os dados de antes do login sobem); se o servidor já tem dados, o aparelho baixa tudo.
 */
export async function iniciarSync(userId: string) {
  instalarGanchos();
  instalarGatilhos();
  usuarioAtual = userId;
  mudar({ status: "sincronizando" });
  const anterior = (await db.config.get("sync"))?.valor as { espaco: string; userId: string } | undefined;
  const { data: espaco, error } = await supabase.rpc("garantir_espaco");
  if (error || !espaco) {
    // Sem internet ao abrir, mas este aparelho já tem a conta: abre com os dados locais e sincroniza quando der.
    if (anterior?.userId === userId && (!error || ehFalhaDeRede(error))) {
      sessaoPendente = true;
      mudar({ status: "offline", erro: undefined, pendentes: await db.fila.count() });
      ligarRelogio();
      return;
    }
    mudar({ status: "erro", erro: error?.message ?? "Sem espaço" });
    throw error ?? new Error("Sem espaço");
  }
  sessaoPendente = false;
  if (anterior && (anterior.espaco !== espaco || anterior.userId !== userId)) {
    await limparDadosLocais();
    await aplicarRemoto(["config"], async () => { await db.config.delete("perfil"); });
  }
  if (!anterior || anterior.espaco !== espaco || anterior.userId !== userId) {
    let remoto = 0;
    for (const t of NOMES) {
      const { count } = await supabase.from(t).select("id", { count: "exact", head: true }).eq("espaco_id", espaco).eq("excluido", false);
      remoto += count ?? 0;
    }
    if (remoto === 0 && (await contarLocal()) > 0) {
      const agora = Date.now();
      for (const t of TABELAS_DADOS) {
        const chaves = (await db.table(t).toCollection().primaryKeys()) as string[];
        await db.fila.bulkPut(chaves.map((id) => ({ chave: `${t}:${id}`, tabela: t, id: String(id), op: "put" as const, quando: agora })));
      }
    } else if (remoto > 0) {
      await limparDadosLocais();
    }
    await db.config.put({ chave: "sync", valor: { espaco, userId } });
  }

  // Perfil: o do servidor vale; se ainda não existe lá, sobe o deste aparelho.
  const { data: perfilRemoto } = await supabase.from("perfis").select("*").eq("user_id", userId).maybeSingle();
  if (perfilRemoto) {
    const p: Perfil = { nome: perfilRemoto.nome, idade: perfilRemoto.idade ?? undefined, uso: perfilRemoto.uso, empresa: perfilRemoto.empresa ?? undefined,
      objetivo: perfilRemoto.objetivo, meta: perfilRemoto.meta ?? undefined, criadoEm: perfilRemoto.criado_em };
    await aplicarRemoto(["config"], async () => {
      await db.config.put({ chave: "perfil", valor: p });
      await db.config.put({ chave: "empresa", valor: p.uso === "empresa" && p.empresa ? p.empresa : p.nome });
    });
  } else if (await db.config.get("perfil")) {
    await enfileirar("perfil", "perfil", "put");
  }

  sessao = { espaco, userId };
  mudar({ espacoId: espaco, pendentes: await db.fila.count() });
  await ciclo();
  ligarRelogio();
}

function ligarRelogio() {
  window.clearInterval(relogio);
  relogio = window.setInterval(() => void ciclo(), 20_000);
}

/** Abriu sem internet: quando a conexão voltar, termina o início da sincronização. */
let sessaoPendente = false;
let religando = false;
async function religar() {
  if (!sessaoPendente || !usuarioAtual || religando || !navigator.onLine) return;
  religando = true;
  try { await iniciarSync(usuarioAtual); } catch (e) { console.error("religar", e); } finally { religando = false; }
}

let gatilhosInstalados = false;
function instalarGatilhos() {
  if (gatilhosInstalados) return;
  gatilhosInstalados = true;
  const agora = () => void ciclo();
  window.addEventListener("online", agora);
  window.addEventListener("focus", agora);
  window.addEventListener("pageshow", agora);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") agora(); });
}

/** Troca de espaço: envia o pendente, muda no servidor e baixa os dados do novo espaço. */
export async function trocarEspaco(userId: string, espaco: string) {
  await ciclo();
  const { error } = await supabase.rpc("usar_espaco", { p_espaco: espaco });
  if (error) throw error;
  await reiniciarCom(userId);
}
export async function entrarComCodigo(userId: string, codigo: string) {
  await ciclo();
  const { error } = await supabase.rpc("aceitar_convite", { p_codigo: codigo });
  if (error) throw error;
  await reiniciarCom(userId);
}
async function reiniciarCom(userId: string) {
  sessao = null;
  await limparDadosLocais();
  await aplicarRemoto(["config"], async () => { await db.config.delete("sync"); });
  await iniciarSync(userId);
}

/** Sair: envia o que falta e apaga os dados deste aparelho (ficam guardados na conta). */
export async function sairDaConta() {
  try { await ciclo(); } catch { /* segue mesmo offline */ }
  window.clearInterval(relogio);
  sessao = null; sessaoPendente = false; usuarioAtual = null;
  // Antes do signOut (ainda com permissão): o aparelho deixa de receber os avisos desta conta.
  await desligarPushAoSair();
  await supabase.auth.signOut();
  await aplicarRemoto([...TABELAS_DADOS, "fila", "config", "compartilhados"], async () => {
    for (const t of [...TABELAS_DADOS, "fila", "config", "compartilhados"]) await db.table(t).clear();
  });
  mudar({ status: "desligado", espacoId: undefined, pendentes: 0 });
}
