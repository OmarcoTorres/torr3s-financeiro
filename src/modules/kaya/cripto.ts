/**
 * Kaya Life — criptografia de ponta a ponta (WebCrypto, nada de biblioteca de terceiros).
 *
 * - Chave dos dados (DK): AES-GCM 256 aleatória, criada no aparelho. Nunca sai dele em claro.
 * - PIN → PBKDF2-SHA256 (600 mil iterações) → chave que embrulha a DK. Fica SÓ no aparelho.
 * - Código de recuperação (128 bits aleatórios, mostrado uma vez) → PBKDF2 → embrulha a DK.
 *   Só esse embrulho vai para a nuvem: sem o código, o servidor guarda um bloco inútil.
 * - Cada registro: AES-GCM com IV aleatório de 96 bits e AAD = "<usuário>:<id>" (um bloco não pode
 *   ser trocado de lugar nem de dono sem a decifragem falhar).
 * - Na memória, a DK é uma CryptoKey não exportável; o app esquece a chave ao bloquear.
 */
const te = new TextEncoder();
const td = new TextDecoder();
export const ITERACOES = 600_000;

export const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function derivar(segredo: string, sal: Uint8Array, iteracoes: number) {
  const base = await crypto.subtle.importKey("raw", te.encode(segredo.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export interface Embrulho { sal: string; iteracoes: number; iv: string; chave_embrulhada: string }

/** Embrulha a chave dos dados (bytes) com um segredo (PIN ou código de recuperação). */
export async function embrulhar(dk: Uint8Array, segredo: string): Promise<Embrulho> {
  const sal = aleatorio(16), iv = aleatorio(12);
  const k = await derivar(segredo, sal, ITERACOES);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode("kaya-dk-v1") }, k, dk);
  return { sal: b64(sal), iteracoes: ITERACOES, iv: b64(iv), chave_embrulhada: b64(ct) };
}

/** Desembrulha e devolve os bytes da chave dos dados (para reembrulhar com outro segredo). Segredo errado → erro. */
export async function desembrulharBruto(e: Embrulho, segredo: string): Promise<Uint8Array> {
  const k = await derivar(segredo, deB64(e.sal), e.iteracoes);
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(e.iv), additionalData: te.encode("kaya-dk-v1") }, k, deB64(e.chave_embrulhada))); }
  catch { throw new Error("Não confere. Confira e tente de novo."); }
}

/** Nova chave dos dados (bytes, para embrulhar logo em seguida e depois apagar). */
export const novaChaveDados = () => aleatorio(32);
export const importarChave = (dk: Uint8Array) => crypto.subtle.importKey("raw", dk, "AES-GCM", false, ["encrypt", "decrypt"]);

/** Código de recuperação: 26 caracteres base32 (128 bits), em blocos para ler e copiar. */
export function novoCodigoRecuperacao() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I
  const b = aleatorio(26);
  const s = Array.from(b, (x) => A[x & 31]).join("");
  return s.match(/.{1,4}/g)!.join("-");
}
export const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g)?.join("-") ?? "";

export async function cifrar(chave: CryptoKey, aad: string, obj: unknown) {
  const iv = aleatorio(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(aad) }, chave, te.encode(JSON.stringify(obj)));
  return { iv: b64(iv), dados: b64(ct) };
}
export async function decifrar<T>(chave: CryptoKey, aad: string, iv: string, dados: string): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv), additionalData: te.encode(aad) }, chave, deB64(dados));
  return JSON.parse(td.decode(pt)) as T;
}
