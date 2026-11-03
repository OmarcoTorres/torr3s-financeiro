import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Home, List, MessageSquareText, MoreHorizontal, Plus, ScanLine, Users } from "lucide-react";
import { db, type Lancamento, type Perfil } from "./db";
import { useConfig, useDados, marcarProgresso } from "./components/ui";
import { LancamentoForm, type Rascunho } from "./components/LancamentoForm";
import { LerConta } from "./components/LerConta";
import { Assistente } from "./components/Assistente";
import { BoasVindas } from "./components/BoasVindas";
import { Tour, type PassoTour } from "./components/Tour";
import { saudacao } from "./lib/perfil";
import { Inicio } from "./pages/Inicio";
import { Lancamentos } from "./pages/Lancamentos";
import { Relatorios } from "./pages/Relatorios";
import { Pessoas } from "./pages/Pessoas";
import { Mais, type Secao } from "./pages/Mais";

type Aba = "inicio" | "lancamentos" | "relatorios" | "pessoas" | "mais";
const ABAS: [Aba, string, typeof Home][] = [
  ["inicio", "Início", Home], ["lancamentos", "Lançamentos", List], ["relatorios", "Relatórios", BarChart3],
  ["pessoas", "Pessoas", Users], ["mais", "Mais", MoreHorizontal],
];
const TITULO: Record<Aba, string> = { inicio: "", lancamentos: "Lançamentos", relatorios: "Relatórios", pessoas: "Pessoas", mais: "Mais opções" };

const TOUR: PassoTour[] = [
  { alvo: "extrato", titulo: "Seu extrato", texto: "O saldo de todas as contas, e quanto entrou, saiu e sobrou neste mês. A linha mostra o saldo dia a dia." },
  { alvo: "lancar", titulo: "Lançar é por aqui", texto: "Gasto, recebimento ou transferência. Dá para parcelar, repetir todo mês, anexar foto e dividir com outras pessoas." },
  { alvo: "ler-conta", titulo: "Conta pela foto", texto: "Fotografe um boleto ou fatura: valor, vencimento e categoria vêm preenchidos, e você confere antes de salvar." },
  { alvo: "nav-lancamentos", titulo: "Todos os lançamentos", texto: "Busca e filtros por período, categoria, conta, pessoa e situação. Toque em um item para editar." },
  { alvo: "nav-relatorios", titulo: "Relatórios", texto: "Fluxo de caixa, despesas por categoria, a pagar e a receber. Monte o seu e exporte em PDF ou planilha." },
  { alvo: "nav-pessoas", titulo: "Pessoas", texto: "Clientes, fornecedores, sócios, família. Cada ficha mostra quanto a pessoa deve e quanto você deve a ela." },
  { alvo: "nav-mais", titulo: "Fechamento e ajustes", texto: "Feche o mês, edite categorias e contas, mude cores e faça backup. O tour pode ser refeito por aqui." },
  { alvo: "passos", titulo: "Seu passo a passo", texto: "Uma lista curta para deixar tudo pronto. Cada item leva direto para onde precisa." },
];

/** Texto claro ou escuro conforme a luminância da cor de destaque. */
function corTexto(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160 ? "#141b24" : "#ffffff";
}

export default function App() {
  const dados = useDados();
  const [perfil, perfilCarregado] = usePerfil();
  const [empresa] = useConfig("empresa", "");
  const [logo] = useConfig<string>("logo", "");
  const [cor] = useConfig("cor", "#b8681c");
  const [tema] = useConfig<"sistema" | "claro" | "escuro">("tema", "sistema");
  const [tourPendente, setTourPendente] = useConfig("tourPendente", false);

  const [aba, setAba] = useState<Aba>(() => {
    const h = location.hash.slice(1) as Aba;
    return ABAS.some(([k]) => k === h) ? h : "inicio";
  });
  const [secao, setSecao] = useState<Secao>("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [fotoNova, setFotoNova] = useState<Blob>();
  const [lerAberto, setLerAberto] = useState(false);
  const [perguntaAberta, setPerguntaAberta] = useState(false);
  const [tour, setTour] = useState(false);

  useEffect(() => { history.replaceState(null, "", `#${aba}`); window.scrollTo(0, 0); if (aba === "relatorios") marcarProgresso("relatorio"); }, [aba]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-base", cor);
    root.style.setProperty("--accent-ink-base", corTexto(cor));
    if (tema === "sistema") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", tema);
  }, [cor, tema]);
  useEffect(() => { document.title = empresa ? `Tostão · ${empresa}` : "Tostão"; }, [empresa]);
  useEffect(() => {
    if (perfil && tourPendente) { setAba("inicio"); setTimeout(() => setTour(true), 350); setTourPendente(false); }
  }, [perfil, tourPendente, setTourPendente]);

  const abrir = (l: Lancamento) => { setFotoNova(undefined); setRascunho(l); };
  const novo = () => { setFotoNova(undefined); setRascunho({ tipo: "despesa" }); };
  const ir = (d: "lancamentos" | "relatorios" | "pessoas" | "fechamento" | "contas" | "backup" | "perfil") => {
    if (d === "lancamentos" || d === "relatorios" || d === "pessoas") { setAba(d); return; }
    setAba("mais"); setSecao(d);
  };

  if (!dados.pronto || !perfilCarregado) return <div className="conteudo" style={{ justifyItems: "center", minHeight: "60vh", alignContent: "center" }}><span className="carregando" aria-label="Carregando" /></div>;
  if (!perfil) return <BoasVindas aoTerminar={() => undefined} />;

  return (
    <div className="app">
      <nav className="nav" aria-label="Seções">
        <div className="marca"><img src="/icon.svg" alt="" />Tostão</div>
        {ABAS.map(([k, nome, I]) => (
          <button key={k} type="button" data-tour={`nav-${k}`} aria-current={aba === k ? "page" : undefined} onClick={() => { setAba(k); setSecao(""); }}><I aria-hidden />{nome}</button>
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
            <button type="button" className="btn icone" data-tour="ler-conta" aria-label="Ler conta pela foto" title="Ler conta pela foto" onClick={() => setLerAberto(true)}><ScanLine /></button>
            <button type="button" className="btn icone" aria-label="Perguntar sobre os números" title="Perguntar sobre os números" onClick={() => setPerguntaAberta(true)}><MessageSquareText /></button>
          </div>
        </header>

        {aba === "inicio" && <Inicio dados={dados} perfil={perfil} abrir={abrir} novo={novo} lerConta={() => setLerAberto(true)} perguntar={() => setPerguntaAberta(true)} ir={ir} />}
        {aba === "lancamentos" && <Lancamentos dados={dados} abrir={abrir} />}
        {aba === "relatorios" && <Relatorios dados={dados} />}
        {aba === "pessoas" && <Pessoas dados={dados} abrir={abrir} />}
        {aba === "mais" && <Mais dados={dados} secao={secao} setSecao={setSecao} refazerTour={() => { setAba("inicio"); setTimeout(() => setTour(true), 300); }} />}
      </main>

      <button type="button" className="fab" data-tour="lancar" aria-label="Novo lançamento" onClick={novo}><Plus />Lançar</button>

      <LancamentoForm rascunho={rascunho} fotoNova={fotoNova} dados={dados} fechar={() => { setRascunho(null); setFotoNova(undefined); }} />
      <LerConta aberta={lerAberto} fechar={() => setLerAberto(false)} dados={dados} aoLer={(r, foto) => { setLerAberto(false); setFotoNova(foto); setRascunho(r); }} />
      <Assistente aberta={perguntaAberta} fechar={() => setPerguntaAberta(false)} dados={dados} />
      {tour && <Tour passos={TOUR} aoFechar={() => setTour(false)} />}
    </div>
  );
}

/** Perfil do usuário, distinguindo "ainda carregando" (undefined) de "não existe" (null). */
function usePerfil(): [Perfil | null, boolean] {
  const r = useLiveQuery(() => db.config.get("perfil").then((x) => ({ p: (x?.valor as Perfil | undefined) ?? null })), []);
  return [r?.p ?? null, r !== undefined];
}
