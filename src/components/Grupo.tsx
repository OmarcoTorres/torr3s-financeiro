import { useEffect, useState } from "react";
import { Copy, MessageCircle, Share2, UserMinus, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { aceitarConviteGrupo, esquecerCompartilhadosDe } from "../lib/sync";
import { BotaoConfirmar, useAviso, useConfig } from "./ui";
import type { Perfil } from "../db";

type Membro = { user_id: string; nome: string; desde: string };
const ENDERECO = typeof location !== "undefined" ? location.origin : "https://torr3s-financeiro.vercel.app";

export function mensagemPadrao(nome: string, codigo: string) {
  const link = `${ENDERECO}/?convite=${codigo}`;
  return [
    "Oi! Te convidei para o meu grupo no Invest+, o app que eu uso para organizar as finanças.",
    "Assim a gente acompanha juntos as receitas e despesas que eu compartilhar com você, e você também pode compartilhar as suas.",
    "",
    "Como entrar:",
    `1. Abra o link: ${link}`,
    "2. Toque em Criar conta e use seu e-mail e uma senha",
    "3. Confirme o e-mail e entre: você já entra no meu grupo",
    "",
    "No iPhone, abra pelo Safari e toque em Compartilhar › Adicionar à Tela de Início para usar como app.",
    "",
    `Se o app pedir um código, use: ${codigo}`,
    nome ? `\n${nome.split(" ")[0]}` : "",
  ].join("\n").trim();
}

/** Seu grupo: quem está conectado, convite pelo WhatsApp e entrada por código. */
export function SeuGrupo() {
  const aviso = useAviso();
  const [perfil] = useConfig<Perfil | null>("perfil", null);
  const [grupo, setGrupo] = useState<Membro[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [codigoGerado, setCodigoGerado] = useState("");
  const [recebido, setRecebido] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = () => supabase.rpc("meu_grupo").then(({ data, error }) => {
    if (error) { setGrupo([]); setErro(/meu_grupo/.test(error.message) ? "Falta atualizar o banco (migração 0005)." : "Não foi possível carregar o seu grupo agora."); }
    else setGrupo((data ?? []) as Membro[]);
  });
  useEffect(() => { void carregar(); }, []);

  async function rodar(fn: () => Promise<unknown>) {
    setTrabalhando(true); setErro("");
    try { await fn(); } catch (e) { setErro(String((e as Error)?.message ?? e)); } finally { setTrabalhando(false); }
  }

  async function prepararConvite() {
    const { data, error } = await supabase.rpc("gerar_convite_grupo");
    if (error) throw new Error(/gerar_convite_grupo/.test(error.message) ? "Falta atualizar o banco (migração 0005)." : error.message);
    const c = String(data);
    setCodigoGerado(c);
    setMensagem(mensagemPadrao(perfil?.nome ?? "", c));
  }

  async function compartilhar() {
    try {
      if (navigator.share) { await navigator.share({ text: mensagem }); return; }
    } catch { return; /* cancelado */ }
    await copiar();
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(mensagem); aviso("Mensagem copiada."); } catch { aviso("Selecione o texto e copie."); }
  }

  return (
    <>
      <div className="bloco">
        <div className="cab"><b>Seu grupo</b><Users size={18} className="muted" /></div>
        <span className="muted" style={{ fontSize: ".86rem" }}>Cada pessoa tem o próprio financeiro. Quem está no seu grupo vê só os lançamentos que você marcar como <b>compartilhado</b>, e você vê os que ela compartilhar. Ninguém edita o do outro.</span>
        {grupo === null ? <span className="carregando" aria-label="Carregando" /> : grupo.length === 0 ? (
          <span className="muted" style={{ fontSize: ".86rem" }}>Ninguém no seu grupo ainda.</span>
        ) : grupo.map((m) => (
          <div key={m.user_id} className="cab" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <div><b style={{ fontWeight: 600 }}>{m.nome}</b><div className="muted" style={{ fontSize: ".8rem" }}>no grupo desde {new Date(m.desde).toLocaleDateString("pt-BR")}</div></div>
            <BotaoConfirmar className="btn fantasma" confirmar="Toque de novo para remover" onConfirm={() => rodar(async () => {
              const { error } = await supabase.rpc("desconectar", { p_outro: m.user_id });
              if (error) throw error;
              await esquecerCompartilhadosDe(m.user_id);
              aviso(`${m.nome} saiu do seu grupo.`); await carregar();
            })}><UserMinus size={18} />Remover</BotaoConfirmar>
          </div>
        ))}
      </div>

      <div className="bloco">
        <b>Convidar pelo WhatsApp</b>
        {!codigoGerado ? (
          <>
            <span className="muted" style={{ fontSize: ".86rem" }}>Vai uma mensagem de boas-vindas com o link do app e o passo a passo. Quem abrir o link e criar a conta entra no seu grupo sozinho, e cada um aparece como Pessoa no app do outro.</span>
            <div><button type="button" className="btn pri" disabled={trabalhando} onClick={() => rodar(prepararConvite)}><MessageCircle />Preparar convite</button></div>
          </>
        ) : (
          <>
            <label className="campo"><span>Mensagem (pode editar)</span>
              <textarea id="convite-msg" value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={12} style={{ fontSize: 15, lineHeight: 1.45 }} />
            </label>
            <div className="linha-botoes">
              <a className="btn pri" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Enviar pelo WhatsApp</a>
              <button type="button" className="btn" onClick={compartilhar}><Share2 />Outro app</button>
              <button type="button" className="btn fantasma" onClick={copiar}><Copy />Copiar</button>
            </div>
            <span className="muted" style={{ fontSize: ".8rem" }}>Código {codigoGerado} · vale 7 dias e uma pessoa. <button type="button" className="btn fantasma" style={{ minHeight: 0, padding: 0, display: "inline" }} onClick={() => setMensagem(mensagemPadrao(perfil?.nome ?? "", codigoGerado))}>Restaurar texto</button></span>
          </>
        )}
      </div>

      <div className="bloco">
        <b>Recebeu um convite?</b>
        <span className="muted" style={{ fontSize: ".84rem" }}>Se você abriu pelo link, já entrou automaticamente. Se recebeu só o código, digite aqui.</span>
        <div className="busca">
          <input className="entrada" id="cv-codigo" placeholder="Código de 12 letras" value={codigo} autoCapitalize="characters" autoCorrect="off"
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} aria-label="Código de convite" />
          <button type="button" className="btn pri" disabled={trabalhando || codigo.length < 8} onClick={() => rodar(async () => {
            const nome = await aceitarConviteGrupo(codigo);
            setRecebido(nome); setCodigo(""); aviso(`Você e ${nome} agora estão no mesmo grupo.`); await carregar();
          })}>Entrar</button>
        </div>
        {recebido && <span className="pos" style={{ fontSize: ".86rem" }}>Pronto: {recebido} já aparece em Pessoas.</span>}
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

