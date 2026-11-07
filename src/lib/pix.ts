/**
 * Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central) para uma chave Pix.
 * Não usa API de banco: qualquer app de banco lê. O valor e o identificador (txid) vão dentro do código.
 */
const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** Sem acento, maiúsculas, só caracteres aceitos pelo padrão e no tamanho máximo. */
const limpar = (s: string, max: number) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-/]/g, "").trim().toUpperCase().slice(0, max);

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no fim do BR Code. */
export function crc16(texto: string) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(texto)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Chave no formato aceito: e-mail em minúsculas, telefone com +55, CPF/CNPJ só números, aleatória como está. */
export function normalizarChave(chave: string) {
  const c = chave.trim();
  if (c.includes("@")) return c.toLowerCase();
  const dig = c.replace(/\D/g, "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();
  if (c.startsWith("+")) return `+${dig}`;
  if (dig.length === 11 && /[()\s-]/.test(c) && dig[2] === "9") return `+55${dig}`; // (11) 9xxxx-xxxx
  if (dig.length === 11 || dig.length === 14) return dig; // CPF / CNPJ
  if (dig.length === 13 && dig.startsWith("55")) return `+${dig}`;
  return c;
}

export function pixCopiaECola(o: { chave: string; recebedor: string; cidade: string; valorCentavos?: number; txid?: string; mensagem?: string }) {
  const chave = normalizarChave(o.chave);
  const msg = o.mensagem ? limpar(o.mensagem, Math.max(0, 99 - 4 - 18 - 4 - chave.length - 4)) : "";
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave) + (msg ? campo("02", msg) : "");
  const txid = (o.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const corpo =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (o.valorCentavos ? campo("54", (o.valorCentavos / 100).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", limpar(o.recebedor, 25) || "RECEBEDOR") +
    campo("60", limpar(o.cidade, 15) || "SAO PAULO") +
    campo("62", campo("05", txid)) +
    "6304";
  return corpo + crc16(corpo);
}
