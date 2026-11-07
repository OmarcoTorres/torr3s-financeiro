import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, QrCode, Settings } from "lucide-react";
import { db, type Meta, type Perfil } from "../db";
import { useChavePix, type ChavePix } from "../lib/chavePix";
import { hoje } from "../lib/calc";
import { dinheiro, lerValor } from "../lib/format";
import { extrasDaMinhaMeta, guardarNaMetaDoGrupo, useGruposEstado, useTemaAtivo } from "../lib/grupos";
import { pixCopiaECola } from "../lib/pix";
import { primeiroNome } from "../lib/tema";
import { Campo, Folha, useAviso, useConfig } from "./ui";
import { celebrarDeposito, mensagemDeCarinho } from "./Coracoes";
import { InputValor } from "./campos";

/**
 * Depósito por Pix feito só no app: gera o copia e cola / QR Code para o Pix DA CONTA de quem está depositando
 * (cada pessoa cadastra o seu). O pagamento é feito no app do banco; "Já paguei" lança o valor na meta.
 */

/** Formulário do "seu Pix": usado na primeira vez que a pessoa deposita e em ⚙️. */
export function FormChavePix({ aoSalvar, explicacao }: { aoSalvar?: () => void; explicacao?: string }) {
  const aviso = useAviso();
  const [atual, salvar] = useChavePix();
  const [perfil] = useConfig<Perfil | null>("perfil", null);
  const [form, setForm] = useState<ChavePix>(() => atual ?? { chave: "", recebedor: perfil?.nome ?? "", cidade: "SAO PAULO" });
  const [trabalhando, setTrabalhando] = useState(false);
  // Perfil e chave carregam depois da 1ª renderização: preenche o que ainda estiver vazio.
  useEffect(() => {
    setForm((f) => ({ chave: f.chave || atual?.chave || "", recebedor: f.recebedor || atual?.recebedor || perfil?.nome || "", cidade: f.cidade || atual?.cidade || "SAO PAULO" }));
  }, [atual, perfil?.nome]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span className="muted" style={{ fontSize: ".88rem" }}>{explicacao ?? "A conta onde você guarda o dinheiro. Os seus depósitos vão para ela. Fica salvo na sua conta do Invest+, em qualquer celular."}</span>
      <Campo rotulo="Sua chave Pix"><input value={form.chave} autoCapitalize="none" autoCorrect="off" placeholder="Chave aleatória, e-mail, celular ou CPF" onChange={(e) => setForm({ ...form, chave: e.target.value.trim() })} /></Campo>
      <div className="duas">
        <Campo rotulo="Nome do titular"><input value={form.recebedor} maxLength={60} onChange={(e) => setForm({ ...form, recebedor: e.target.value })} /></Campo>
        <Campo rotulo="Cidade"><input value={form.cidade} maxLength={40} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></Campo>
      </div>
      <div className="linha-botoes">
        <button type="button" className="btn pri" disabled={trabalhando || form.chave.trim().length < 3 || !form.recebedor.trim()} onClick={async () => {
          setTrabalhando(true);
          try { await salvar(form); aviso("Seu Pix foi salvo."); aoSalvar?.(); }
          catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(false); }
        }}>{trabalhando ? "Salvando…" : "Salvar meu Pix"}</button>
      </div>
    </div>
  );
}

/**
 * Painel do Pix para um valor qualquer: copia e cola em destaque (é o que se usa no celular),
 * QR Code pequeno abaixo (para pagar de outro aparelho) e "Já paguei".
 * Depois de copiar, quando a pessoa volta do app do banco, pergunta se pagou.
 */
export function PainelPix({ valorCentavos, mensagem, aoPagar, aoCancelar }: { valorCentavos: number; mensagem?: string; aoPagar: () => Promise<void>; aoCancelar?: () => void }) {
  const aviso = useAviso();
  const [cfg, , carregado] = useChavePix();
  const [img, setImg] = useState("");
  const [copiou, setCopiou] = useState(false);
  const [perguntar, setPerguntar] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [txid] = useState(() => `IVP${Date.now().toString(36).toUpperCase()}`);
  const codigo = cfg ? pixCopiaECola({ chave: cfg.chave, recebedor: cfg.recebedor, cidade: cfg.cidade, valorCentavos, txid, mensagem: mensagem ?? "Invest+" }) : "";

  useEffect(() => { if (codigo) void QRCode.toDataURL(codigo, { margin: 1, width: 320, errorCorrectionLevel: "M" }).then(setImg); }, [codigo]);
  // Voltou do app do banco depois de copiar: pergunta se pagou (não precisa procurar o botão).
  useEffect(() => {
    if (!copiou) return;
    const voltar = () => { if (document.visibilityState === "visible") setPerguntar(true); };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [copiou]);

  async function copiar() {
    try { await navigator.clipboard.writeText(codigo); setCopiou(true); aviso("Copiado! Abra o app do banco › Pix › Pix copia e cola."); }
    catch { aviso("Selecione o código e copie."); }
  }
  async function pagar() {
    setTrabalhando(true);
    try { await aoPagar(); } finally { setTrabalhando(false); }
  }

  if (!cfg) return (
    <div className="bloco" style={{ background: "var(--surface-2)", gap: 10 }}>
      <b>Pix de {dinheiro(valorCentavos)}: falta o seu Pix</b>
      {carregado ? <FormChavePix explicacao="Informe a chave Pix da conta onde você guarda o dinheiro. É só na primeira vez: depois o depósito segue direto." />
        : <span className="carregando" aria-label="Carregando" />}
      {aoCancelar && <div><button type="button" className="btn fantasma" onClick={aoCancelar}>Cancelar</button></div>}
    </div>
  );

  return (
    <div className="bloco" style={{ background: "var(--surface-2)", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}><b>Pix de {dinheiro(valorCentavos)}</b><span className="muted" style={{ fontSize: ".8rem" }}>para {cfg.recebedor}</span></div>
      {perguntar ? (
        <div className="aviso dica" role="alertdialog" aria-label="Confirmar pagamento">
          <div><b>Pagou os {dinheiro(valorCentavos)}?</b>
            <div className="linha-botoes">
              <button type="button" className="btn pri" disabled={trabalhando} onClick={() => void pagar()}><Check />Sim, paguei</button>
              <button type="button" className="btn fantasma" onClick={() => setPerguntar(false)}>Ainda não</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="btn pri" style={{ width: "100%", justifyContent: "center" }} onClick={() => void copiar()}><Copy />{copiou ? "Copiar de novo" : "Copiar Pix copia e cola"}</button>
          <textarea readOnly value={codigo} rows={3} aria-label="Pix copia e cola" style={{ fontFamily: "var(--mono, monospace)", fontSize: 11, width: "100%" }} onFocus={(e) => e.currentTarget.select()} />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {img ? <img src={img} alt={`QR Code Pix de ${dinheiro(valorCentavos)}`} width={112} height={112} style={{ background: "#fff", padding: 4, borderRadius: 8, flex: "none" }} /> : <span className="carregando" aria-label="Gerando QR Code" />}
            <span className="muted" style={{ fontSize: ".8rem" }}>QR Code para pagar de outro aparelho. Confira o nome do recebedor no banco antes de confirmar.</span>
          </div>
          <div className="linha-botoes">
            <button type="button" className="btn" disabled={trabalhando} onClick={() => void pagar()}><Check />Já paguei</button>
            {aoCancelar && <button type="button" className="btn fantasma" onClick={aoCancelar}>Cancelar</button>}
          </div>
        </>
      )}
    </div>
  );
}

export function DepositarPix({ metasMinhas, meuId }: { metasMinhas: Meta[]; meuId?: string }) {
  const aviso = useAviso();
  const [cfg] = useChavePix();
  const { metas: metasGrupo, grupos } = useGruposEstado();
  const { tema } = useTemaAtivo(meuId);
  const [aberta, setAberta] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [valor, setValor] = useState("");
  const [meta, setMeta] = useState("");
  const [gerado, setGerado] = useState<{ valor: number; mensagem: string } | null>(null);
  const semChave = !cfg;
  const dosOutros = metasGrupo.filter((m) => !m.minha);
  const opcoes = [
    ...metasMinhas.map((m) => ({ k: `minha:${m.id}`, nome: m.nome })),
    ...dosOutros.map((m) => ({ k: `grupo:${m.espaco_id}:${m.id}`, nome: `${m.nome} (de ${primeiroNome(m.dono_nome)})` })),
  ];

  function gerar() {
    const v = lerValor(valor) ?? 0;
    if (v <= 0) { aviso("Informe um valor."); return; }
    setGerado({ valor: v, mensagem: opcoes.find((o) => o.k === meta)?.nome ?? grupos[0]?.nome ?? "Invest+" });
  }
  async function jaPaguei() {
    if (!gerado) return;
    const v = gerado.valor;
    try {
      let alvo: { nome: string; antes: number; alvo: number; cor: string } | undefined;
      if (meta.startsWith("minha:")) {
        const m = await db.metas.get(meta.slice(6));
        if (m) {
          const extra = m.grupoId ? extrasDaMinhaMeta(m.id, metasGrupo) : 0;
          alvo = { nome: m.nome, antes: m.guardado + extra, alvo: m.alvo, cor: m.cor };
          await db.metas.update(m.id, { guardado: m.guardado + v, aportes: [...m.aportes, { data: hoje(), valor: v }] });
        }
      } else if (meta.startsWith("grupo:")) {
        const [, espaco, id] = meta.split(":");
        const m = dosOutros.find((x) => x.espaco_id === espaco && x.id === id);
        if (m) {
          alvo = { nome: m.nome, antes: m.guardado + m.aportes.reduce((a, x) => a + x.valor, 0), alvo: m.alvo, cor: m.cor };
          await guardarNaMetaDoGrupo(m, v);
        }
      }
      celebrarDeposito({
        valor: v, metaNome: alvo?.nome, antes: alvo?.antes, depois: alvo ? alvo.antes + v : undefined, alvo: alvo?.alvo,
        cor: tema?.cor ?? alvo?.cor, mensagem: mensagemDeCarinho(v, alvo?.nome, alvo ? alvo.alvo - alvo.antes - v : undefined),
      });
      setGerado(null); setValor(""); setMeta(""); setAberta(false);
    } catch (e) {
      aviso(navigator.onLine ? String((e as Error).message) : "Sem internet: para guardar na meta de outra pessoa é preciso estar conectado.");
    }
  }

  return (
    <section className="card" style={{ borderTop: tema ? `4px solid ${tema.cor}` : undefined }}>
      <div className="cab">
        <h2>Depositar por Pix</h2>
        <button type="button" className="btn fantasma" aria-label="Meu Pix" title="Meu Pix" onClick={() => setAjustes(true)}><Settings size={18} /></button>
      </div>
      <span className="muted" style={{ fontSize: ".88rem" }}>
        {semChave ? "Informe o seu Pix (a conta onde você guarda o dinheiro). Cada pessoa cadastra o seu."
          : `Vai para o seu Pix (${cfg!.recebedor} · ${cfg!.chave.slice(0, 8)}…), no valor que você digitar. Também dá para depositar de dentro de cada meta.`}
      </span>
      <div><button type="button" className="btn pri" onClick={() => (semChave ? setAjustes(true) : setAberta(true))}><QrCode />{semChave ? "Informar meu Pix" : "Depositar"}</button></div>

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
            <div className="linha-botoes"><button type="button" className="btn pri" onClick={gerar}><QrCode />Gerar Pix</button></div>
          </>
        ) : (
          <PainelPix valorCentavos={gerado.valor} mensagem={gerado.mensagem} aoPagar={jaPaguei} aoCancelar={() => setGerado(null)} />
        )}
      </Folha>

      <Folha titulo="Meu Pix" aberta={ajustes} fechar={() => setAjustes(false)}>
        <FormChavePix aoSalvar={() => setAjustes(false)} />
      </Folha>
    </section>
  );
}
