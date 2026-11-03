import { db, type Config } from "../db";
import { baixar } from "./exportar";
import { hoje } from "./calc";

const DADOS = ["lancamentos", "pessoas", "categorias", "contas", "fechamentos", "relatorios", "metas"] as const;
/** Chaves de controle da sincronização: são deste aparelho e nunca entram nem saem do backup. */
const ehControle = (c: Config) => c.chave === "sync" || c.chave.startsWith("cursor:");

const blobParaDataURL = (b: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = erro; r.readAsDataURL(b);
});

export async function exportarBackup() {
  const dados: Record<string, unknown> = { app: "financeiro", versao: 2, geradoEm: new Date().toISOString() };
  for (const t of DADOS) dados[t] = await db.table(t).toArray();
  dados.config = (await db.config.toArray()).filter((c) => !ehControle(c));
  const fotos = await db.fotos.toArray();
  dados.fotos = await Promise.all(fotos.map(async (f) => ({ id: f.id, dataURL: await blobParaDataURL(f.blob) })));
  baixar(`investmais-backup-${hoje()}.json`, new Blob([JSON.stringify(dados)], { type: "application/json" }));
}

/** Apaga linha a linha (e não com clear) para a exclusão também chegar à nuvem. */
async function apagarDados() {
  for (const t of [...DADOS, "fotos"]) {
    const chaves = await db.table(t).toCollection().primaryKeys();
    await db.table(t).bulkDelete(chaves);
  }
}

/** Substitui todos os dados do espaço pelos do backup. */
export async function importarBackup(arquivo: File) {
  const dados = JSON.parse(await arquivo.text());
  if (dados?.app !== "financeiro" || !Array.isArray(dados.lancamentos)) throw new Error("Este arquivo não é um backup do Invest+.");
  const fotos = await Promise.all((dados.fotos ?? []).map(async (f: { id: string; dataURL: string }) => ({ id: f.id, blob: await (await fetch(f.dataURL)).blob() })));
  await apagarDados();
  for (const t of DADOS) if (Array.isArray(dados[t])) await db.table(t).bulkPut(dados[t]);
  await db.fotos.bulkPut(fotos);
  const configs = ((dados.config ?? []) as Config[]).filter((c) => !ehControle(c));
  await db.config.bulkPut(configs);
  return dados.lancamentos.length as number;
}

/** Apaga lançamentos, pessoas, contas, cartões, categorias e metas do espaço (aqui e na nuvem). */
export async function apagarTudo() {
  await apagarDados();
  const configs = (await db.config.toArray()).filter((c) => !ehControle(c)).map((c) => c.chave);
  await db.config.bulkDelete(configs);
}
