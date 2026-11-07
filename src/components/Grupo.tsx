import { useEffect, useState } from "react";
import { Bell, Check, Copy, Mail, MessageCircle, Pencil, Share2, Sparkles, UserMinus, Users, X } from "lucide-react";
import { aceitarConviteGrupo, esquecerCompartilhadosDe } from "../lib/sync";
import {
  atualizarGrupo, convidarPorEmail, criarGrupo, definirVisualDoGrupo, gerarConviteDoGrupo, grupoPrincipal, recarregarGrupos, recusarConvite,
  sairDoGrupo, useGrupos, usarComoPrincipal, type Grupo,
} from "../lib/grupos";
import { TEMAS, TIPOS, temaDe, type TipoGrupo } from "../lib/tema";
import { BotaoConfirmar, ICONES, useAviso, useConfig } from "./ui";
import type { Perfil } from "../db";

const ENDERECO = typeof location !== "undefined" ? location.origin : "https://torr3s-financeiro.vercel.app";

export function mensagemPadrao(nome: string, codigo: string, tipo?: TipoGrupo, grupo?: string) {
  const link = `${ENDERECO}/?convite=${codigo}`;
  const tema = temaDe(tipo);
  return [
    tema.convite,
    grupo ? `O grupo se chama “${grupo}”: lá a gente compartilha as metas e guarda junto.` : "Assim a gente acompanha juntos as receitas, despesas e metas que a gente compartilhar.",
    "",
    "Como entrar:",
    `1. Abra o link: ${link}`,
    "2. Toque em Criar conta e use seu e-mail e uma senha (se já tem conta, só entre)",
    "3. Confirme o e-mail e entre: você já entra no grupo",
    "",
    "No iPhone, abra pelo Safari e toque em Compartilhar › Adicionar à Tela de Início para usar como app.",
    "",
    `Se o app pedir um código, use: ${codigo}`,
    nome ? `\n${nome.split(" ")[0]}` : "",
  ].join("\n").trim();
}

function IconeTema({ tipo, size = 18 }: { tipo?: string; size?: number }) {
  const t = temaDe(tipo);
  const I = ICONES[t.icone] ?? Users;
  return <span style={{ display: "inline-grid", placeItems: "center", width: size + 16, height: size + 16, borderRadius: 12, background: `color-mix(in srgb, ${t.cor} 16%, var(--surface))`, color: t.cor, flex: "none" }}><I size={size} /></span>;
}

/** Escolha do tipo do grupo: cada um muda a temática do app. */
function EscolherTipo({ valor, mudar }: { valor: TipoGrupo; mudar: (t: TipoGrupo) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }} role="radiogroup" aria-label="Tipo do grupo">
      {TIPOS.map((t) => {
        const on = valor === t; const tema = TEMAS[t];
        return (
          <button key={t} type="button" role="radio" aria-checked={on} onClick={() => mudar(t)}
            style={{ display: "grid", gap: 4, textAlign: "left", padding: 10, borderRadius: 14, border: `2px solid ${on ? tema.cor : "var(--line)"}`, background: on ? `color-mix(in srgb, ${tema.cor} 8%, var(--surface))` : "var(--surface)", color: "var(--ink)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconeTema tipo={t} size={16} /><b>{tema.rotulo}</b></span>
            <small className="muted" style={{ lineHeight: 1.3 }}>{tema.descricao}</small>
          </button>
        );
      })}
    </div>
  );
}

/** Convites endereçados a você (vindos por e-mail/push). Aparece no topo do app e em Conta e grupo. */
export function ConvitesRecebidos() {
  const aviso = useAviso();
  const { convites } = useGrupos();
  const [trabalhando, setTrabalhando] = useState("");
  if (!convites.length) return null;
  return (
    <div className="aviso dica" id="convites" role="region" aria-label="Convites para você">
      <Bell />
      <div style={{ display: "grid", gap: 10, width: "100%" }}>
        {convites.map((c) => {
          const tema = temaDe(c.tipo);
          return (
            <div key={c.codigo}>
              <b>{c.de.split(" ")[0]} te convidou para {c.grupo ? `“${c.grupo}”` : "um grupo"}</b>
              {c.tipo && c.tipo !== "outro" && <span className="chip" style={{ marginLeft: 6 }}>{tema.rotulo}</span>}
              <div className="muted" style={{ fontSize: ".84rem" }}>{tema.descricao}</div>
              <div className="linha-botoes">
                <button type="button" className="btn pri" disabled={!!trabalhando} onClick={async () => {
                  setTrabalhando(c.codigo);
                  try { const nome = await aceitarConviteGrupo(c.codigo); await recarregarGrupos(); aviso(`Pronto! Você e ${nome.split(" ")[0]} agora estão no mesmo grupo.`); }
                  catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(""); }
                }}><Check />{trabalhando === c.codigo ? "Entrando…" : "Aceitar"}</button>
                <button type="button" className="btn fantasma" disabled={!!trabalhando} onClick={async () => {
                  setTrabalhando(c.codigo);
                  try { await recusarConvite(c.codigo); aviso("Convite recusado."); } catch (e) { aviso(String((e as Error).message)); } finally { setTrabalhando(""); }
                }}><X />Recusar</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Convidar para um grupo: quem já tem conta (e-mail + push) ou pelo WhatsApp (link). */
function ConvidarPara({ g, fechar }: { g: Grupo; fechar: () => void }) {
  const aviso = useAviso();
  const [perfil] = useConfig<Perfil | null>("perfil", null);
  const [modo, setModo] = useState<"email" | "whats">("email");
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");

  async function rodar(fn: () => Promise<void>) {
    setTrabalhando(true); setErro("");
    try { await fn(); } catch (e) { setErro(String((e as Error)?.message ?? e)); } finally { setTrabalhando(false); }
  }
  const prepararWhats = () => rodar(async () => {
    const c = await gerarConviteDoGrupo(g.id);
    setCodigo(c); setMensagem(mensagemPadrao(perfil?.nome ?? "", c, g.tipo, g.nome));
  });
  async function copiar() {
    try { await navigator.clipboard.writeText(mensagem); aviso("Mensagem copiada."); } catch { aviso("Selecione o texto e copie."); }
  }
  async function compartilhar() {
    try { if (navigator.share) { await navigator.share({ text: mensagem }); return; } } catch { return; }
    await copiar();
  }

  return (
    <div className="bloco" style={{ background: "var(--surface-2)" }}>
      <div className="cab"><b>Convidar para “{g.nome}”</b><button type="button" className="btn fantasma" onClick={fechar} aria-label="Fechar"><X size={18} /></button></div>
      <div className="seg" role="tablist" style={{ display: "flex", gap: 6 }}>
        <button type="button" role="tab" aria-selected={modo === "email"} className={`btn ${modo === "email" ? "pri" : "suave"}`} onClick={() => setModo("email")}><Mail size={16} />Já tem conta</button>
        <button type="button" role="tab" aria-selected={modo === "whats"} className={`btn ${modo === "whats" ? "pri" : "suave"}`} onClick={() => { setModo("whats"); if (!codigo) void prepararWhats(); }}><MessageCircle size={16} />WhatsApp</button>
      </div>

      {modo === "email" ? (
        <>
          <span className="muted" style={{ fontSize: ".86rem" }}>Para quem já usa o Invest+. Chega uma notificação no celular dela e o convite aparece no app, em “Convites para você”.</span>
          <div className="busca">
            <input className="entrada" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="E-mail da conta dela" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-label="E-mail de quem você quer convidar" />
            <button type="button" className="btn pri" disabled={trabalhando || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => rodar(async () => {
              const r = await convidarPorEmail(g.id, email);
              const nome = r.nome.split(" ")[0];
              setResultado(r.enviados > 0
                ? `Convite enviado. ${nome} recebeu a notificação no celular.`
                : r.enviados < 0 ? `Convite já enviado há pouco para ${nome}. Ele continua em “Convites para você” no app.`
                : `Convite criado para ${nome}, mas o celular dela não está com as notificações do Invest+ ativas. Ele aparece quando ${nome} abrir o app. Peça para ativar em Ajustes › Notificações.`);
              setEmail("");
            })}>{trabalhando ? "Enviando…" : "Convidar"}</button>
          </div>
          {resultado && <span className="pos" style={{ fontSize: ".86rem" }} role="status">{resultado}</span>}
        </>
      ) : !codigo ? <span className="carregando" aria-label="Preparando convite" /> : (
        <>
          <label className="campo"><span>Mensagem (pode editar)</span>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={11} style={{ fontSize: 15, lineHeight: 1.45 }} />
          </label>
          <div className="linha-botoes">
            <a className="btn pri" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Enviar pelo WhatsApp</a>
            <button type="button" className="btn" onClick={compartilhar}><Share2 />Outro app</button>
            <button type="button" className="btn fantasma" onClick={copiar}><Copy />Copiar</button>
          </div>
          <span className="muted" style={{ fontSize: ".8rem" }}>Código {codigo} · vale 7 dias e uma pessoa.</span>
        </>
      )}
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
    </div>
  );
}

function EditarGrupo({ g, fechar }: { g?: Grupo; fechar: () => void }) {
  const aviso = useAviso();
  const [tipo, setTipo] = useState<TipoGrupo>(g?.tipo ?? "casal");
  const [nome, setNome] = useState(g?.nome ?? TEMAS.casal.nomeSugerido);
  const [mexeuNome, setMexeuNome] = useState(!!g);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { if (!mexeuNome) setNome(TEMAS[tipo].nomeSugerido); }, [tipo, mexeuNome]);
  return (
    <div className="bloco" style={{ background: "var(--surface-2)" }}>
      <div className="cab"><b>{g ? "Editar grupo" : "Criar grupo"}</b><button type="button" className="btn fantasma" onClick={fechar} aria-label="Fechar"><X size={18} /></button></div>
      <span className="muted" style={{ fontSize: ".86rem" }}>O tipo muda o jeito do app: mensagens, incentivos nas metas e as cores.</span>
      <EscolherTipo valor={tipo} mudar={setTipo} />
      <label className="campo"><span>Nome do grupo</span>
        <input value={nome} maxLength={60} onChange={(e) => { setNome(e.target.value); setMexeuNome(true); }} />
      </label>
      <div className="linha-botoes">
        <button type="button" className="btn pri" disabled={trabalhando || !nome.trim()} onClick={async () => {
          setTrabalhando(true); setErro("");
          try {
            if (g) await atualizarGrupo(g.id, nome.trim(), tipo); else await criarGrupo(nome.trim(), tipo);
            aviso(g ? "Grupo atualizado." : `Grupo “${nome.trim()}” criado. Agora convide quem vai com você.`); fechar();
          } catch (e) { setErro(String((e as Error)?.message ?? e)); } finally { setTrabalhando(false); }
        }}>{g ? "Salvar" : "Criar grupo"}</button>
      </div>
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
    </div>
  );
}

/** Seus grupos (casal, irmãos, estudo, empresa…), convites e a temática do app. */
export function SeuGrupo({ userId }: { userId?: string }) {
  const aviso = useAviso();
  const estado = useGrupos();
  const { grupos, carregado, erro: erroCarga, visual } = estado;
  const principal = grupoPrincipal(estado);
  const [editando, setEditando] = useState<Grupo | "novo" | null>(null);
  const [convidando, setConvidando] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");

  async function rodar(fn: () => Promise<unknown>) {
    setTrabalhando(true); setErro("");
    try { await fn(); } catch (e) { setErro(String((e as Error)?.message ?? e)); } finally { setTrabalhando(false); }
  }

  return (
    <>
      <ConvitesRecebidos />
      <div className="bloco">
        <div className="cab"><b>Seus grupos</b><Users size={18} className="muted" /></div>
        <span className="muted" style={{ fontSize: ".86rem" }}>Cada pessoa tem o próprio financeiro. No grupo, vocês veem os lançamentos que cada um marcar como <b>compartilhado</b> e as <b>metas compartilhadas</b>, onde todos podem guardar junto.</span>
        {!carregado && !grupos.length ? <span className="carregando" aria-label="Carregando" /> : grupos.length === 0 ? (
          <span className="muted" style={{ fontSize: ".86rem" }}>Você ainda não está em nenhum grupo.</span>
        ) : grupos.map((g) => {
          const tema = temaDe(g.tipo);
          const outros = g.membros.filter((m) => m.user_id !== userId);
          return (
            <div key={g.id} style={{ display: "grid", gap: 8, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <div className="cab" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <IconeTema tipo={g.tipo} />
                  <div style={{ minWidth: 0 }}>
                    <b>{g.nome}</b> <span className="chip">{tema.rotulo}</span> {principal?.id === g.id && grupos.length > 1 && <span className="chip">tema do app</span>}
                    <div className="muted" style={{ fontSize: ".8rem" }}>{outros.length ? `Com ${outros.map((m) => m.nome.split(" ")[0]).join(", ")}` : "Só você por enquanto"}</div>
                  </div>
                </div>
                <button type="button" className="btn fantasma" onClick={() => setEditando(g)} aria-label={`Editar ${g.nome}`}><Pencil size={16} /></button>
              </div>
              {g.tipo === "outro" && <span className="warn" style={{ fontSize: ".84rem" }}>Escolha o tipo deste grupo (Casal, Irmãos, Estudo…) para o app ganhar o tema certo. Toque no lápis.</span>}
              <div className="linha-botoes">
                <button type="button" className="btn suave" onClick={() => setConvidando(convidando === g.id ? null : g.id)}><Mail size={16} />Convidar</button>
                {grupos.length > 1 && principal?.id !== g.id && <button type="button" className="btn suave" onClick={() => { usarComoPrincipal(g.id); aviso(`O app agora segue o tema de “${g.nome}”.`); }}><Sparkles size={16} />Usar este tema</button>}
                <BotaoConfirmar className="btn fantasma" confirmar="Toque de novo para sair" onConfirm={() => rodar(async () => {
                  const restantes = grupos.filter((x) => x.id !== g.id).flatMap((x) => x.membros.map((m) => m.user_id));
                  await sairDoGrupo(g.id);
                  for (const m of outros) if (!restantes.includes(m.user_id)) await esquecerCompartilhadosDe(m.user_id);
                  aviso(`Você saiu de “${g.nome}”.`);
                })}><UserMinus size={16} />Sair</BotaoConfirmar>
              </div>
              {convidando === g.id && <ConvidarPara g={g} fechar={() => setConvidando(null)} />}
              {editando !== "novo" && editando?.id === g.id && <EditarGrupo g={g} fechar={() => setEditando(null)} />}
            </div>
          );
        })}
        {editando === "novo" ? <EditarGrupo fechar={() => setEditando(null)} /> : (
          <div><button type="button" className="btn pri" onClick={() => setEditando("novo")}><Users />Criar grupo</button></div>
        )}
        {grupos.length > 0 && (
          <label className="linha-toggle" style={{ borderBottom: 0 }}>
            <span><b>Usar as cores do grupo no app</b><small>O app segue a cor do tema de “{principal?.nome}”. Desligado, vale a cor que você escolheu em Aparência.</small></span>
            <input type="checkbox" className="interruptor" checked={visual} onChange={(e) => definirVisualDoGrupo(e.target.checked)} />
          </label>
        )}
        {erroCarga && <div className="aviso neg" role="alert">{erroCarga}</div>}
      </div>

      <div className="bloco">
        <b>Recebeu um código?</b>
        <span className="muted" style={{ fontSize: ".84rem" }}>Se você abriu pelo link, já entrou automaticamente. Se recebeu só o código, digite aqui.</span>
        <div className="busca">
          <input className="entrada" placeholder="Código de 12 letras" value={codigo} autoCapitalize="characters" autoCorrect="off"
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} aria-label="Código de convite" />
          <button type="button" className="btn pri" disabled={trabalhando || codigo.length < 8} onClick={() => rodar(async () => {
            const nome = await aceitarConviteGrupo(codigo);
            setCodigo(""); await recarregarGrupos(); aviso(`Você e ${nome.split(" ")[0]} agora estão no mesmo grupo.`);
          })}>Entrar</button>
        </div>
      </div>
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
    </>
  );
}

/** Interruptor "Compartilhar a conta inteira com meu grupo" (contas e cartões). */
export function CompartilharConta({ valor, mudar, pessoas, cartao }: { valor: boolean; mudar: (v: boolean) => void; pessoas: { nome: string; userId?: string }[]; cartao?: boolean }) {
  const nomes = pessoas.filter((p) => p.userId).map((p) => p.nome.split(" ")[0]).join(", ");
  return (
    <label className="linha-toggle" style={{ background: "var(--surface-2)", borderRadius: 16, padding: "12px 14px", borderBottom: 0 }}>
      <span>
        <b>Compartilhar {cartao ? "o cartão" : "a conta"} inteiro{cartao ? "" : "a"} com meu grupo</b>
        <small>{nomes
          ? `${nomes} ${nomes.includes(",") ? "veem" : "vê"} todos os lançamentos ${cartao ? "deste cartão" : "desta conta"}, sem precisar marcar um por um. Ninguém edita.`
          : "Ninguém no seu grupo ainda: convide em Ajustes › Conta e grupo. A opção já fica valendo quando a pessoa entrar."}</small>
      </span>
      <input type="checkbox" className="interruptor" checked={valor} onChange={(e) => mudar(e.target.checked)} />
    </label>
  );
}

