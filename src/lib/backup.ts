import { db } from "../db";
import { baixar } from "./exportar";
import { hoje } from "./calc";

const TABELAS = ["lancamentos", "pessoas", "categorias", "contas", "fechamentos", "relatorios", "config"] as const;

const blobParaDataURL = (b: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = erro; r.readAsDataURL(b);
});

export async function exportarBackup() {
  const dados: Record<string, unknown> = { app: "financeiro", versao: 1, geradoEm: new Date().toISOString() };
  for (const t of TABELAS) dados[t] = await db.table(t).toArray();
  const fotos = await db.fotos.toArray();
  dados.fotos = await Promise.all(fotos.map(async (f) => ({ id: f.id, dataURL: await blobParaDataURL(f.blob) })));
  baixar(`financeiro-backup-${hoje()}.json`, new Blob([JSON.stringify(dados)], { type: "application/json" }));
}

/** Substitui todos os dados do aparelho pelo conteúdo do backup. */
export async function importarBackup(arquivo: File) {
  const dados = JSON.parse(await arquivo.text());
  if (dados?.app !== "financeiro" || !Array.isArray(dados.lancamentos)) throw new Error("Este arquivo não é um backup do Financeiro.");
  const fotos = await Promise.all((dados.fotos ?? []).map(async (f: { id: string; dataURL: string }) => ({ id: f.id, blob: await (await fetch(f.dataURL)).blob() })));
  await db.transaction("rw", [...TABELAS.map((t) => db.table(t)), db.fotos], async () => {
    for (const t of TABELAS) { await db.table(t).clear(); await db.table(t).bulkAdd(dados[t] ?? []); }
    await db.fotos.clear(); await db.fotos.bulkAdd(fotos);
  });
  return dados.lancamentos.length as number;
}

export async function apagarTudo() {
  await db.transaction("rw", [...TABELAS.map((t) => db.table(t)), db.fotos], async () => {
    for (const t of TABELAS) await db.table(t).clear();
    await db.fotos.clear();
  });
}
