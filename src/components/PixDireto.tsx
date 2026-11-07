import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, QrCode, Settings } from "lucide-react";
import { db, type Meta } from "../db";
import { hoje } from "../lib/calc";
import { dinheiro, lerValor } from "../lib/format";
import { guardarNaMetaDoGrupo, useGruposEstado, useTemaAtivo } from "../lib/grupos";
import { pixCopiaECola } from "../lib/pix";
import { frase, primeiroNome } from "../lib/tema";
import { Campo, Folha, useAviso, useConfig } from "./ui";
import { InputValor } from "./campos";

/**
 * Depósito por Pix feito só no app: gera o QR Code / copia e cola para a chave Pix configurada neste aparelho.
 * O pagamento é feito no app do banco; "Já paguei" lança o valor na meta escolhida.
 * A chave fica salva só neste aparelho (não vai para o código nem para o servidor).
 */
type ConfigPix = { chave: string; recebedor: string; cidade: string };
const PADRAO: ConfigPix = { chave: "", recebedor: "", cidade: "SAO PAULO" };

export function DepositarPix({ metasMinhas, meuId }: { metasMinhas: Meta[]; meuId?: string }) {
  const aviso = useAviso();
  const [cfg, setCfg] = useConfig<ConfigPix>("pixDeposito", PADRAO);
  const { metas: metasGrupo, grupos } = useGruposEstado();
  const { tema } = useTemaAtivo(meuId);
  const [aberta, setAberta] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [valor, setValor] = useState("");
  const [meta, setMeta] = useState("");
  const [gerado, setGerado] = useState<{ codigo: string; valor: number; img: string } | null>(null);
  const [form, setForm] = useState<ConfigPix>(cfg);

  useEffect(() => { if (ajustes) setForm(cfg); }, [ajustes, cfg]);
  const semChave = !cfg.chave.trim();
  const dosOutros = metasGrupo.filter((m) => !m.minha);
  const opcoes = [
    ...metasMinhas.map((m) => ({ k: `minha:${m.id}`, nome: m.nome })),
    ...dosOutros.map((m) => ({ k: `grupo:${m.espaco_id}:${m.id}`, nome: `${m.nome} (de ${primeiroNome(m.dono_nome)})` })),
  ];

  async function gerar() {
    const v = lerValor(valor) ?? 0;
    if (v <= 0) { aviso("Informe um valor."); return; }
    const txid = `IVP${Date.now().toString(36).toUpperCase()}`;
    const nomeMeta = opcoes.find((o) => o.k === meta)?.nome;
    const codigo = pixCopiaECola({ chave: cfg.chave, recebedor: cfg.recebedor || "RECEBEDOR", cidade: cfg.cidade, valorCentavos: v, txid, mensagem: nomeMeta ?? grupos[0]?.nome ?? "Invest+" });
    const img = await QRCode.toDataURL(codigo, { margin: 1, width: 560, errorCorrectionLevel: "M" });
    setGerado({ codigo, valor: v, img });
  }
  async function copiar() {
    if (!gerado) return;
    try { await navigator.clipboard.writeText(gerado.codigo); aviso("Pix copia e cola copiado. Cole no app do seu banco."); } catch { aviso("Selecione o código e copie."); }
  }
  async function jaPaguei() {
    if (!gerado) return;
    const v = gerado.valor;
    try {
      if (meta.startsWith("minha:")) {
        const m = await db.metas.get(meta.slice(6));
        if (m) await db.metas.update(m.id, { guardado: m.guardado + v, aportes: [...m.aportes, { data: hoje(), valor: v }] });
      } else if (meta.startsWith("grupo:")) {
        const [, espaco, id] = meta.split(":");
        const m = dosOutros.find((x) => x.espaco_id === espaco && x.id === id);
        if (m) await guardarNaMetaDoGrupo(m, v);
      }
      aviso(tema && meta ? frase(tema.comemoracoes, { v: dinheiro(v) }, Date.now() % 7) : `Depósito de ${dinheiro(v)} registrado.`);
      setGerado(null); setValor(""); setMeta(""); setAberta(false);
    } catch (e) {
      aviso(navigator.onLine ? String((e as Error).message) : "Sem internet: para guardar na meta de outra pessoa é preciso estar conectado.");
    }
  }

  return (
    <section className="card" style={{ borderTop: tema ? `4px solid ${tema.cor}` : undefined }}>
      <div className="cab">
        <h2>Depositar por Pix</h2>
        <button type="button" className="btn fantasma" aria-label="Chave Pix de destino" title="Chave Pix de destino" onClick={() => setAjustes(true)}><Settings size={18} /></button>
      </div>
      <span className="muted" style={{ fontSize: ".88rem" }}>
        {semChave ? "Cadastre a chave Pix da conta onde vocês guardam o dinheiro. Ela fica salva só neste aparelho."
          : `Gera o QR Code para ${cfg.recebedor || "a conta"} · chave ${cfg.chave.slice(0, 8)}…. Pague no app do banco e toque em “Já paguei”.`}
      </span>
      <div><button type="button" className="btn pri" onClick={() => (semChave ? setAjustes(true) : setAberta(true))}><QrCode />{semChave ? "Cadastrar chave Pix" : "Depositar"}</button></div>

      <Folha titulo={gerado ? `Pix de ${dinheiro(gerado.valor)}` : "Depositar por Pix"} aberta={aberta} fechar={() => { setAberta(false); setGerado(null); }}>
        {!gerado ? (
          <>
            <Campo rotulo="Valor"><InputValor id="px-valor" value={valor} onChange={setValor} /></Campo>
            {opcoes.length > 0 && (
              <label className="campo"><span>Para qual meta (opcional)</span>
                <select value={meta} onChange={(e) => setMeta(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {opcoes.map((o) => <option key={o.k} value={o.k}>{o.nome}</option>)}
                </select>
              </label>
            )}
            <div className="linha-botoes"><button type="button" className="btn pri" onClick={() => void gerar()}><QrCode />Gerar QR Code</button></div>
          </>
        ) : (
          <>
            <span className="muted" style={{ fontSize: ".88rem" }}>No app do banco: Pix › <b>Pix copia e cola</b> (ou leia o QR de outro aparelho). Confira o nome do recebedor antes de confirmar.</span>
            <img src={gerado.img} alt={`QR Code Pix de ${dinheiro(gerado.valor)}`} style={{ width: "min(280px, 100%)", justifySelf: "center", background: "#fff", padding: 8, borderRadius: 12 }} />
            <label className="campo"><span>Pix copia e cola</span>
              <textarea readOnly value={gerado.codigo} rows={4} style={{ fontFamily: "var(--mono, monospace)", fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className="linha-botoes">
              <button type="button" className="btn pri" onClick={() => void copiar()}><Copy />Copiar código</button>
              <button type="button" className="btn" onClick={() => void jaPaguei()}><Check />Já paguei</button>
            </div>
          </>
        )}
      </Folha>

      <Folha titulo="Chave Pix de destino" aberta={ajustes} fechar={() => setAjustes(false)}>
        <span className="muted" style={{ fontSize: ".88rem" }}>A conta que recebe os depósitos (ex.: o Itaú da caixinha). Fica salva só neste aparelho: cada um cadastra no seu celular.</span>
        <Campo rotulo="Chave Pix"><input value={form.chave} autoCapitalize="none" autoCorrect="off" placeholder="Chave aleatória, e-mail, celular ou CPF" onChange={(e) => setForm({ ...form, chave: e.target.value.trim() })} /></Campo>
        <div className="duas">
          <Campo rotulo="Nome do titular"><input value={form.recebedor} maxLength={60} onChange={(e) => setForm({ ...form, recebedor: e.target.value })} /></Campo>
          <Campo rotulo="Cidade"><input value={form.cidade} maxLength={40} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></Campo>
        </div>
        <div className="linha-botoes">
          <button type="button" className="btn pri" disabled={form.chave.trim().length < 3} onClick={async () => { await setCfg({ ...form, chave: form.chave.trim() }); aviso("Chave Pix salva neste aparelho."); setAjustes(false); }}>Salvar</button>
        </div>
      </Folha>
    </section>
  );
}
