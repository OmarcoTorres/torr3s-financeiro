import { comprimirImagem } from "./ia";

/** O servidor recusa arquivos acima de 5 MB; a margem evita ficar no limite. */
export const LIMITE_FOTO = 4.5 * 1024 * 1024;
const JA_PEQUENA = 600 * 1024;

/**
 * Deixa a foto pronta para guardar e sincronizar: JPEG de no máximo 1600 px.
 * Foto já pequena em JPEG passa direto. Se o aparelho não conseguir converter
 * (formato que o navegador não abre), usa a original quando ela cabe no limite.
 */
export async function prepararFoto(foto: Blob): Promise<Blob> {
  if (foto.size <= JA_PEQUENA && /jpe?g/i.test(foto.type)) return foto;
  try {
    const { blob } = await comprimirImagem(foto);
    return blob.size < foto.size || !/jpe?g/i.test(foto.type) ? blob : foto;
  } catch {
    if (foto.size <= LIMITE_FOTO) return foto;
    throw new Error("Não deu para reduzir esta foto e ela passa de 4,5 MB. Tire uma nova foto ou escolha outra imagem.");
  }
}
