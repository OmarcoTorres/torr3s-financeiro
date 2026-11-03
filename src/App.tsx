import { Fragment, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeftRight, BarChart3, Cloud, CloudOff, CreditCard, RefreshCw, LayoutGrid, MessageSquareText, MoreHorizontal, Plus, ScanLine, Settings, Target, Users } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { db, removerExemplos, type Lancamento, type Perfil } from "./db";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import { aceitarConviteGrupo, convitePendente, iniciarSync, limparConvitePendente, sairDaConta, sincronizarAgora, useSync } from "./lib/sync";
import { Login } from "./components/Login";
import { Folha, useAviso, useConfig, useDados, marcarProgresso } from "./components/ui";
import { GuiaInstalacao } from "./components/Instalar";
import { instalado } from "./lib/push";
import { LancamentoForm, type Rascunho } from "./components/LancamentoForm";
import { LerConta } from "./components/LerConta";
import { Assistente } from "./components/Assistente";
import { BoasVindas } from "./components/BoasVindas";
import { Tour, type PassoTour } from "./components/Tour";
import { saudacao } from "./lib/perfil";
import { Inicio, type Destino } from "./pages/Inicio";
import { Cartoes } from "./pages/Cartoes";
import { Metas } from "./pages/Metas";
import { Lancamentos } from "./pages/Lancamentos";
import { Relatorios } from "./pages/Relatorios";
import { Pessoas } from "./pages/Pessoas";
import { Mais, type Secao } from "./pages/Mais";
import { useAvisosNaoLidos } from "./lib/avisos";

type Aba = "inicio" | "transacoes" | "cartoes" | "metas" | "relatorios" | "pessoas" | "mais";
/** [aba, nome, ícone, onde aparece]: "ambos", só no computador (barra lateral) ou só no celular (barra inferior). */
const ABAS: [Aba, string, typeof LayoutGrid, "ambos" | "desktop" | "celular"][] = [
  ["inicio", "Dashboard", LayoutGrid, "ambos"],
  ["transacoes", "Transações", ArrowLeftRight, "ambos"],
  ["cartoes", "Cartões", CreditCard, "desktop"],
  ["metas", "Metas", Target, "ambos"],
  ["relatorios", "Relatórios", BarChart3, "ambos"],
  ["pessoas", "Pessoas", Users, "desktop"],
  ["mais", "Mais", MoreHorizontal, "ambos"],
];
const TITULO: Record<Aba, string> = { inicio: "", transacoes: "Transações", cartoes: "Cartões", metas: "Metas", relatorios: "Relatórios", pessoas: "Pessoas", mais: "Ajustes" };

const TOUR: PassoTour[] = [
  { alvo: "extrato", titulo: "Visão geral", texto: "Saldo das contas, receitas e despesas do mês e o total das faturas de cartão." },
  { alvo: "lancar", titulo: "Lançar é por aqui", texto: "Gasto, recebimento, compra no cartão ou transferência. Dá para parcelar, repetir todo mês, anexar foto e dividir com outras pessoas." },
  { alvo: "ler-conta", titulo: "Conta pela foto", texto: "Fotografe um boleto ou fatura: valor, vencimento e categoria vêm preenchidos, e você confere antes de salvar." },
  { alvo: "nav-transacoes", titulo: "Transações", texto: "Todas as movimentações, com busca e filtros por período, categoria, conta, pessoa e situação." },
  { alvo: "nav-metas", titulo: "Metas", texto: "Defina objetivos, registre quanto guardou e veja quanto falta por mês." },
  { alvo: "nav-relatorios", titulo: "Relatórios", texto: "Fluxo de caixa, despesas por categoria, a pagar e a receber. Monte o seu e exporte em PDF ou planilha." },
  { alvo: "nav-mais", titulo: "Cartões e ajustes", texto: "Cartões de crédito, pessoas, fechamento do mês, categorias, contas, aparência e backup." },
  { alvo: "passos", titulo: "Seu passo a passo", texto: "Uma lista curta para deixar tudo pronto. Cada item leva direto para onde precisa." },
];

/** Texto claro ou escuro conforme a luminância da cor de destaque. */
function corTexto(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160 ? "#1d2142" : "#ffffff";
}

/** Porteiro: sem login mostra a tela de entrar; com login liga a sincronização e abre o app. */
export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  const [syncPronto, setSyncPronto] = useState<string | null>(null);
  const [erroSync, setErroSync] = useState("");

  useEffect(() => {
    if (!supabaseConfigurado) { setSessao(null); return; }
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY") setRecuperando(true);
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = sessao?.user.id;
  useEffect(() => {
    if (!userId || syncPronto === userId) return;
    setErroSync("");
    iniciarSync(userId).then(() => setSyncPronto(userId)).catch((e) => setErroSync(String(e?.message ?? e)));
  }, [userId, syncPronto]);

  // Só para conferência local das telas (VITE_SEM_LOGIN=1 no build); nunca configurado na Vercel.
  if (import.meta.env.VITE_SEM_LOGIN === "1") return <Painel email="teste@local" userId="local" />;
  if (!supabaseConfigurado) return <div className="conteudo"><div className="aviso neg">O login ainda não foi configurado neste endereço (falta a chave pública do Supabase).</div></div>;
  if (sessao === undefined) return <Carregando />;
  if (recuperando) return <Login modoInicial="nova-senha" aoDefinirSenha={() => setRecuperando(false)} />;
  if (!sessao) return <Login />;
  if (erroSync) return (
    <div className="conteudo" style={{ maxWidth: 560 }}>
      <div className="aviso neg"><div>Não foi possível carregar sua conta agora ({erroSync}).
        <div className="linha-botoes"><button type="button" className="btn" onClick={() => setSyncPronto(null)}>Tentar de novo</button><button type="button" className="btn fantasma" onClick={() => sairDaConta()}>Sair</button></div></div></div>
    </div>
  );
  if (syncPronto !== userId) return <Carregando texto="Sincronizando sua conta…" />;
  return <Painel email={sessao.user.email ?? ""} userId={sessao.user.id} />;
}

function Carregando({ texto }: { texto?: string }) {
  return <div className="conteudo" style={{ justifyItems: "center", minHeight: "60vh", alignContent: "center", gap: 12 }}><span className="carregando" aria-label="Carregando" />{texto && <span className="muted">{texto}</span>}</div>;
}

function Painel({ email, userId }: { email: string; userId: string }) {
  const dados = useDados();
  const [perfil, perfilCarregado] = usePerfil();
  const [empresa] = useConfig("empresa", "");
  const [logo] = useConfig<string>("logo", "");
  const [cor] = useConfig("cor", "#5b5bd6");
  const [tema] = useConfig<"sistema" | "claro" | "escuro">("tema", "claro");
  const [tourPendente, setTourPendente] = useConfig("tourPendente", false);

  const [aba, setAba] = useState<Aba>(() => {
    const bruto = location.hash.slice(1);
    const h = (({ lancamentos: "transacoes", avisos: "inicio" } as Record<string, string>)[bruto] ?? bruto) as Aba;
    return ABAS.some(([k]) => k === h) ? h : "inicio";
  });
  const [secao, setSecao] = useState<Secao>("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [fotoNova, setFotoNova] = useState<Blob>();
  const [lerAberto, setLerAberto] = useState(false);
  const [perguntaAberta, setPerguntaAberta] = useState(false);
  const naoLidos = useAvisosNaoLidos();
  // Tocar numa notificação abre o app em #avisos: vai para o histórico dentro do assistente.
  useEffect(() => {
    const ver = () => { if (location.hash === "#avisos") { setAba("inicio"); setPerguntaAberta(true); } };
    ver();
    window.addEventListener("hashchange", ver);
    return () => window.removeEventListener("hashchange", ver);
  }, []);
  const [tour, setTour] = useState(false);
  const [guiaAberto, setGuiaAberto] = useState(false);
  const tourAgendado = useRef(false);
  // Guia de instalação: aparece uma vez por aparelho, depois do primeiro acesso (se ainda não estiver instalado).
  const oferecerGuia = async () => {
    if (instalado() || (await db.config.get("guia-visto"))) return;
    await db.config.put({ chave: "guia-visto", valor: true });
    setGuiaAberto(true);
  };

  // Convite pelo link: entra no grupo assim que o perfil existir (depois das boas-vindas).
  const aviso = useAviso();
  useEffect(() => {
    const codigo = convitePendente();
    if (!perfil || !codigo) return;
    aceitarConviteGrupo(codigo)
      .then((nome) => aviso(`Bem-vindo! Você e ${nome.split(" ")[0]} agora estão no mesmo grupo.`))
      .catch((e) => { limparConvitePendente(); aviso(String((e as Error).message)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);
  // Versões antigas criavam lançamentos de exemplo: limpa ao abrir, o app começa sempre zerado.
  useEffect(() => { removerExemplos().catch(() => undefined); }, []);
  useEffect(() => { history.replaceState(null, "", `#${aba}`); window.scrollTo(0, 0); if (aba === "relatorios") marcarProgresso("relatorio"); }, [aba]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-base", cor);
    root.style.setProperty("--accent-ink-base", corTexto(cor));
    if (tema === "sistema") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", tema);
  }, [cor, tema]);
  useEffect(() => { document.title = empresa ? `Invest+ · ${empresa}` : "Invest+"; }, [empresa]);
  useEffect(() => {
    if (perfil && tourPendente) { tourAgendado.current = true; setAba("inicio"); setTimeout(() => setTour(true), 350); setTourPendente(false); }
    else if (perfil && !tourPendente && !tourAgendado.current) { const t = setTimeout(() => void oferecerGuia(), 1200); return () => clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, tourPendente, setTourPendente]);

  const abrir = (l: Lancamento) => { setFotoNova(undefined); setRascunho(l); };
  const novo = () => { setFotoNova(undefined); setRascunho({ tipo: "despesa" }); };
  const ir = (d: Destino) => {
    if (d === "transacoes" || d === "relatorios" || d === "pessoas" || d === "cartoes" || d === "metas") { setAba(d); setSecao(""); return; }
    setAba("mais"); setSecao(d);
  };

  if (!dados.pronto || !perfilCarregado) return <Carregando />;
  if (!perfil) return <BoasVindas aoTerminar={() => undefined} />;

  return (
    <div className="app">
      <nav className="nav" aria-label="Seções">
        <div className="marca"><img src="/icon.svg" alt="" />Invest+</div>
        {ABAS.map(([k, nome, I, onde]) => (
          <Fragment key={k}>
            {k === "mais" && <div className="sep" />}
            <button key={k} type="button" className={onde === "desktop" ? "so-desktop" : undefined} data-tour={`nav-${k}`} aria-current={aba === k ? "page" : undefined} onClick={() => { setAba(k); setSecao(""); }}>
              {k === "mais" ? <><MoreHorizontal className="so-celular" aria-hidden /><Settings className="so-desktop" aria-hidden /><span className="so-celular">Mais</span><span className="so-desktop">Ajustes</span></> : <><I aria-hidden />{nome}</>}
            </button>
          </Fragment>
        ))}
      </nav>
      <main className="conteudo">
        <header className="topo">
          <div className="logo">{logo ? <img src={logo} alt="" /> : (empresa || perfil.nome).slice(0, 1).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <h1>{aba === "inicio" ? saudacao(perfil.nome) : TITULO[aba]}</h1>
            <div className="sub">{aba === "inicio" ? (perfil.uso === "empresa" && perfil.empresa ? perfil.empresa : new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })) : empresa}</div>
          </div>
          <div className="acoes">
            <IndicadorSync />
            <button type="button" className="btn icone" data-tour="ler-conta" aria-label="Ler conta pela foto" title="Ler conta pela foto" onClick={() => setLerAberto(true)}><ScanLine /></button>
            <button type="button" className="btn icone" style={{ position: "relative" }} aria-label={naoLidos ? `Assistente: ${naoLidos} aviso(s) novo(s)` : "Assistente"} title="Assistente e avisos" onClick={() => setPerguntaAberta(true)}>
              <MessageSquareText />{naoLidos > 0 && <span className="badge-icone">{naoLidos > 9 ? "9+" : naoLidos}</span>}
            </button>
          </div>
        </header>

        {aba === "inicio" && <Inicio dados={dados} perfil={perfil} abrir={abrir} novo={novo} lerConta={() => setLerAberto(true)} perguntar={() => setPerguntaAberta(true)} ir={ir} />}
        {aba === "transacoes" && <Lancamentos dados={dados} abrir={abrir} />}
        {aba === "cartoes" && <Cartoes dados={dados} abrir={abrir} pagar={(r) => { setFotoNova(undefined); setRascunho(r); }} />}
        {aba === "metas" && <Metas dados={dados} />}
        {aba === "relatorios" && <Relatorios dados={dados} />}
        {aba === "pessoas" && <Pessoas dados={dados} abrir={abrir} />}
        {aba === "mais" && <Mais dados={dados} email={email} userId={userId} secao={secao} setSecao={setSecao} irAba={(a) => setAba(a)} refazerTour={() => { setAba("inicio"); setTimeout(() => setTour(true), 300); }} />}
      </main>

      {aba !== "relatorios" && aba !== "mais" && <button type="button" className="fab" data-tour="lancar" aria-label="Nova transação" onClick={novo}><Plus /><span>Lançar</span></button>}

      <LancamentoForm rascunho={rascunho} fotoNova={fotoNova} dados={dados} fechar={() => { setRascunho(null); setFotoNova(undefined); }} />
      <LerConta aberta={lerAberto} fechar={() => setLerAberto(false)} dados={dados} aoLer={(r, foto) => { setLerAberto(false); setFotoNova(foto); setRascunho(r); }} />
      <Assistente aberta={perguntaAberta} fechar={() => setPerguntaAberta(false)} dados={dados} />
      {tour && <Tour passos={TOUR} aoFechar={() => { setTour(false); setTimeout(() => void oferecerGuia(), 600); }} />}
      <Folha titulo="Use o Invest+ como app" aberta={guiaAberto} fechar={() => setGuiaAberto(false)}>
        <GuiaInstalacao irNotificacoes={() => { setGuiaAberto(false); setAba("mais"); setSecao("notificacoes"); }} />
        <button type="button" className="btn fantasma" onClick={() => setGuiaAberto(false)}>Agora não (fica em Ajustes › Instalar no celular)</button>
      </Folha>
    </div>
  );
}

/** Perfil do usuário, distinguindo "ainda carregando" (undefined) de "não existe" (null). */
function usePerfil(): [Perfil | null, boolean] {
  const r = useLiveQuery(() => db.config.get("perfil").then((x) => ({ p: (x?.valor as Perfil | undefined) ?? null })), []);
  return [r?.p ?? null, r !== undefined];
}

function IndicadorSync() {
  const s = useSync();
  const rotulo = { desligado: "Sincronização desligada", sincronizando: "Sincronizando…", ok: "Tudo salvo na nuvem", offline: "Sem internet: salvo no aparelho, envia quando voltar", erro: `Erro ao sincronizar: ${s.erro ?? ""}` }[s.status];
  const I = s.status === "sincronizando" ? RefreshCw : s.status === "ok" ? Cloud : CloudOff;
  const cor = s.status === "erro" ? "var(--neg)" : s.status === "offline" ? "var(--warn)" : s.status === "ok" ? "var(--pos)" : "var(--muted)";
  return (
    <button type="button" className="btn icone" title={rotulo} aria-label={rotulo} onClick={() => void sincronizarAgora()} style={{ color: cor }}>
      <I className={s.status === "sincronizando" ? "girando" : undefined} />
    </button>
  );
}
