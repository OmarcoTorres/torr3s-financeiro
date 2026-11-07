import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Landmark, QrCode, RefreshCw, Settings, X } from "lucide-react";
import {
  cancelarDeposito, confirmarDeposito, lerBanco, marcarPago, novoDeposito, resumoCaixinha, salvarCaixinha, useCaixinhas,
  type Caixinha as TCaixinha, type Deposito,
} from "../lib/caixinha";
import { useGruposEstado, useTemaAtivo, type Grupo } from "../lib/grupos";
import { pixCopiaECola } from "../lib/pix";
import { frase, primeiroNome } from "../lib/tema";
import { dinheiro, lerValor } from "../lib/format";
import { BotaoConfirmar, Campo, Folha, useAviso } from "./ui";
import { InputValor } from "./campos";

const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const ROTULO: Record<Deposito["status"], string> = { aguardando: "QR gerado", pago: "pago · aguardando o banco", confirmado: "confirmado", cancelado: "cancelado" };

function codigoPix(c: TCaixinha, d: Deposito) {
  return pixCopiaECola({ chave: c.chave_pix, recebedor: c.recebedor, cidade: c.cidade, valorCentavos: d.valor, txid: d.txid, mensagem: c.nome });
}

/** Caixinha do grupo principal (conta real no banco). Fica no topo de Metas. */
export function CaixinhaDoGrupo({ meuId }: { meuId?: string }) {
  const { caixinhas, lendo, erro } = useCaixinhas();
  const grupos = useGruposEstado();
  const { grupo, tema } = useTemaAtivo(meuId);
  const aviso = useAviso();
  const [config, setConfig] = useState(false);
  const [depositar, setDepositar] = useState(false);
  const [qr, setQr] = useState<Deposito | null>(null);
  if (!grupo) return null;
  const c = caixinhas.find((x) => x.grupo_id === grupo.id);

  if (!c) return (
    <section className="card">
      <div className="cab"><h2>Caixinha no banco</h2><Landmark size={18} className="muted" /></div>
      <span className="muted" style={{ fontSize: ".88rem" }}>
        Ligue uma conta sua (ex.: Itaú) para {grupo.nome} depositar junto por Pix. O app gera o QR Code, registra quem pagou e mostra o saldo. O dinheiro fica na sua conta, nunca no app.
      </span>
      <div><button type="button" className="btn pri" onClick={() => setConfig(true)}><Landmark />Configurar caixinha</button></div>
      <ConfigCaixinha grupo={grupo} aberta={config} fechar={() => setConfig(false)} />
    </section>
  );

  const r = resumoCaixinha(c);
  const metasDoGrupo = grupos.metas.filter((m) => m.grupo_id === grupo.id);
  const ativos = c.depositos.filter((d) => d.status !== "cancelado").slice(0, 8);

  return (
    <section className="card" style={{ borderTop: tema ? `4px solid ${tema.cor}` : undefined }}>
      <div className="cab">
        <h2>{c.nome}</h2>
        <span style={{ display: "flex", gap: 4 }}>
          {c.conectado && <button type="button" className="btn fantasma" disabled={lendo} aria-label="Atualizar saldo do banco" title="Atualizar saldo do banco"
            onClick={async () => { try { const j = await lerBanco(c.id, true); aviso(j.lido ? (j.confirmados ? `${j.confirmados} depósito(s) confirmado(s) no extrato.` : "Saldo atualizado.") : (j.motivo ?? "Nada novo.")); } catch (e) { aviso(String((e as Error).message)); } }}>
            <RefreshCw size={18} className={lendo ? "girando" : undefined} /></button>}
          {c.sou_dono && <button type="button" className="btn fantasma" aria-label="Ajustes da caixinha" onClick={() => setConfig(true)}><Settings size={18} /></button>}
        </span>
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <span className="rotulo">Saldo da caixinha</span>
        <b className="num" style={{ fontFamily: "var(--display)", fontSize: "1.8rem" }}>{r.total == null ? "—" : dinheiro(r.total)}</b>
        <span className="muted" style={{ fontSize: ".82rem" }}>
          {r.banco == null
            ? (c.conectado ? "Lendo a conta pela primeira vez…" : `${c.sou_dono ? "Conecte" : `${primeiroNome(grupo.membros.find((m) => m.user_id === c.dono)?.nome)} ainda não conectou`} a conta pelo Meu Pluggy para ver o saldo.`)
            : `No ${c.banco}: ${dinheiro(r.banco)} · atualizado ${quando(c.saldo_em)}`}
          {r.aCaminho > 0 && <> · <span className="warn">+{dinheiro(r.aCaminho)} a caminho</span></>}
        </span>
        {c.erro_leitura && c.sou_dono && <span className="neg" style={{ fontSize: ".8rem" }}>Última leitura falhou: {c.erro_leitura}</span>}
      </div>
      <div><button type="button" className="btn pri" onClick={() => setDepositar(true)}><QrCode />Depositar</button></div>

      {ativos.length > 0 && (
        <div style={{ display: "grid", gap: 0 }}>
          {ativos.map((d) => (
            <div key={d.id} className="cab" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <b className="num">{dinheiro(d.valor)}</b> <span className="muted">· {d.user_id === meuId ? "você" : primeiroNome(d.nome)}{d.meta_nome ? ` → ${d.meta_nome}` : ""}</span>
                <div style={{ fontSize: ".78rem" }} className={d.status === "confirmado" ? "pos" : d.status === "pago" ? "warn" : "muted"}>
                  {d.status === "confirmado" ? <><Check size={12} style={{ verticalAlign: "-1px" }} /> {d.confirmado_por === "banco" ? "confirmado no extrato" : "confirmado"}</> : ROTULO[d.status]} · {quando(d.pago_em ?? d.criado_em)}
                </div>
              </div>
              <span style={{ display: "flex", gap: 4, flex: "none" }}>
                {d.status === "aguardando" && d.user_id === meuId && <button type="button" className="btn suave" onClick={() => setQr(d)}>Ver QR</button>}
                {c.sou_dono && (d.status === "pago" || d.status === "aguardando") && (
                  <BotaoConfirmar className="btn suave" confirmar="Caiu na conta?" onConfirm={async () => { try { await confirmarDeposito(d.id); aviso("Depósito confirmado."); } catch (e) { aviso(String((e as Error).message)); } }}>Confirmar</BotaoConfirmar>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {erro && <div className="aviso neg" role="alert">{erro}</div>}

      <ConfigCaixinha grupo={grupo} c={c} aberta={config} fechar={() => setConfig(false)} />
      <NovoDeposito c={c} aberta={depositar} metas={metasDoGrupo.map((m) => ({ espaco: m.espaco_id, id: m.id, nome: m.nome }))}
        fechar={() => setDepositar(false)} mostrarQr={(d) => { setDepositar(false); setQr(d); }} />
      {qr && <PagarPix c={c} d={c.depositos.find((x) => x.id === qr.id) ?? qr} fechar={() => setQr(null)} />}
    </section>
  );
}

function NovoDeposito({ c, aberta, metas, fechar, mostrarQr }: {
  c: TCaixinha; aberta: boolean; metas: { espaco: string; id: string; nome: string }[]; fechar: () => void; mostrarQr: (d: Deposito) => void;
}) {
  const aviso = useAviso();
  const [valor, setValor] = useState("");
  const [meta, setMeta] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  return (
    <Folha titulo="Depositar na caixinha" aberta={aberta} fechar={fechar}>
      <span className="muted" style={{ fontSize: ".88rem" }}>Vai por Pix para a conta {c.banco} de {c.recebedor.split(" ")[0]}. O app gera o QR Code e o copia e cola com o valor.</span>
      <Campo rotulo="Valor"><InputValor id="cx-valor" value={valor} onChange={setValor} /></Campo>
      {metas.length > 0 && (
        <label className="campo"><span>Para qual meta (opcional)</span>
          <select value={meta} onChange={(e) => setMeta(e.target.value)}>
            <option value="">Só na caixinha</option>
            {metas.map((m) => <option key={`${m.espaco}:${m.id}`} value={`${m.espaco}:${m.id}`}>{m.nome}</option>)}
          </select>
        </label>
      )}
      <div className="linha-botoes">
        <button type="button" className="btn pri" disabled={trabalhando} onClick={async () => {
          const v = lerValor(valor) ?? 0;
          if (v <= 0) { aviso("Informe um valor."); return; }
          setTrabalhando(true);
          try {
            const [espaco, id] = meta ? [meta.slice(0, 36), meta.slice(37)] : [];
            const r = await novoDeposito(c.id, v, meta ? { espaco: espaco!, id: id! } : undefined);
            setValor(""); setMeta("");
            mostrarQr({ id: r.id, txid: r.txid, valor: v, status: "aguardando", user_id: "", nome: "", criado_em: new Date().toISOString() });
          } catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(false); }
        }}><QrCode />{trabalhando ? "Gerando…" : "Gerar QR Code"}</button>
      </div>
    </Folha>
  );
}

/** QR Code + copia e cola + "Já paguei". */
function PagarPix({ c, d, fechar }: { c: TCaixinha; d: Deposito; fechar: () => void }) {
  const aviso = useAviso();
  const { tema } = useTemaAtivo();
  const codigo = codigoPix(c, d);
  const [img, setImg] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  useEffect(() => { void QRCode.toDataURL(codigo, { margin: 1, width: 560, errorCorrectionLevel: "M" }).then(setImg); }, [codigo]);
  async function copiar() {
    try { await navigator.clipboard.writeText(codigo); aviso("Pix copia e cola copiado. Cole no app do seu banco."); } catch { aviso("Selecione o código e copie."); }
  }
  return (
    <Folha titulo={`Pix de ${dinheiro(d.valor)}`} aberta fechar={fechar}>
      <span className="muted" style={{ fontSize: ".88rem" }}>Abra o app do seu banco › Pix › <b>Pix copia e cola</b> (ou leia o QR Code de outro aparelho). Vai para {c.recebedor} · {c.banco}.</span>
      {img ? <img src={img} alt={`QR Code Pix de ${dinheiro(d.valor)}`} style={{ width: "min(280px, 100%)", justifySelf: "center", background: "#fff", padding: 8, borderRadius: 12 }} /> : <span className="carregando" aria-label="Gerando QR Code" />}
      <label className="campo"><span>Pix copia e cola</span>
        <textarea readOnly value={codigo} rows={4} style={{ fontFamily: "var(--mono, monospace)", fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="linha-botoes">
        <button type="button" className="btn pri" onClick={copiar}><Copy />Copiar código</button>
        {d.status === "aguardando" && (
          <button type="button" className="btn" disabled={trabalhando} onClick={async () => {
            setTrabalhando(true);
            try { await marcarPago(d.id); aviso(tema ? frase(tema.comemoracoes, { v: dinheiro(d.valor) }, Date.now() % 7) : "Depósito registrado."); fechar(); }
            catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(false); }
          }}><Check />Já paguei</button>
        )}
      </div>
      {d.status === "aguardando" && (
        <BotaoConfirmar className="btn fantasma" confirmar="Cancelar este depósito?" onConfirm={async () => { try { await cancelarDeposito(d.id); aviso("Depósito cancelado."); fechar(); } catch (e) { aviso(String((e as Error).message)); } }}><X />Cancelar depósito</BotaoConfirmar>
      )}
      <span className="muted" style={{ fontSize: ".8rem" }}>Ao tocar em “Já paguei”, o valor já conta na caixinha e na meta. Quando o banco mostrar o Pix no extrato (até 24 h), aparece “confirmado no extrato”.</span>
    </Folha>
  );
}

function ConfigCaixinha({ grupo, c, aberta, fechar }: { grupo: Grupo; c?: TCaixinha; aberta: boolean; fechar: () => void }) {
  const aviso = useAviso();
  const [f, setF] = useState({ nome: "", chave: "", recebedor: "", cidade: "", itemId: "" });
  const [carregado, setCarregado] = useState<string | null>(null);
  const chaveForm = `${aberta}:${c?.id ?? ""}`;
  if (carregado !== chaveForm) {
    setCarregado(chaveForm);
    setF({ nome: c?.nome ?? `Caixinha ${grupo.nome}`, chave: c?.chave_pix ?? "", recebedor: c?.recebedor ?? "", cidade: c?.cidade ?? "SAO PAULO", itemId: c?.pluggy_item_id ?? "" });
  }
  const [trabalhando, setTrabalhando] = useState(false);
  return (
    <Folha titulo={c ? "Ajustes da caixinha" : "Configurar caixinha"} aberta={aberta} fechar={fechar}>
      <span className="muted" style={{ fontSize: ".88rem" }}>A conta é sua: os depósitos de {grupo.nome} caem nela por Pix. Só você altera estes dados.</span>
      <Campo rotulo="Nome da caixinha"><input value={f.nome} maxLength={40} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
      <Campo rotulo="Sua chave Pix da conta Itaú"><input value={f.chave} autoCapitalize="none" autoCorrect="off" placeholder="CPF, e-mail, celular ou chave aleatória" onChange={(e) => setF({ ...f, chave: e.target.value })} /></Campo>
      <div className="duas">
        <Campo rotulo="Nome do titular (como no banco)"><input value={f.recebedor} maxLength={60} onChange={(e) => setF({ ...f, recebedor: e.target.value })} /></Campo>
        <Campo rotulo="Cidade"><input value={f.cidade} maxLength={40} onChange={(e) => setF({ ...f, cidade: e.target.value })} /></Campo>
      </div>
      <Campo rotulo="Conexão do Meu Pluggy (itemId), para ler o saldo">
        <input value={f.itemId} autoCapitalize="none" autoCorrect="off" placeholder="ex.: 7f3c…-…" onChange={(e) => setF({ ...f, itemId: e.target.value.trim() })} />
      </Campo>
      <details className="muted" style={{ fontSize: ".84rem" }}>
        <summary style={{ cursor: "pointer" }}>Como pegar o itemId (grátis, só leitura)</summary>
        <ol style={{ paddingLeft: 18, display: "grid", gap: 4, marginTop: 6 }}>
          <li>Crie a conta em meu.pluggy.ai e conecte o Itaú (autoriza no app do banco).</li>
          <li>Em dashboard.pluggy.ai (mesma conta) › Applications › Demo › Connect Account, escolha <b>MeuPluggy</b> (não o Itaú).</li>
          <li>Em Connected Items, toque no item do Itaú e copie o id. Cole aqui.</li>
        </ol>
      </details>
      <div className="linha-botoes">
        <button type="button" className="btn pri" disabled={trabalhando || !f.chave.trim() || !f.recebedor.trim()} onClick={async () => {
          setTrabalhando(true);
          try { await salvarCaixinha(grupo.id, f); aviso("Caixinha salva."); fechar(); }
          catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(false); }
        }}>Salvar</button>
      </div>
    </Folha>
  );
}
