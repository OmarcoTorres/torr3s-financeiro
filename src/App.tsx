import { useEffect, useState } from "react";
import { BarChart3, Home, List, MessageCircle, MoreHorizontal, Plus, ScanText, Users } from "lucide-react";
import { prepararBanco, type Lancamento } from "./db";
import { mesAtual } from "./lib/calc";
import { mesExtenso } from "./lib/format";
import { useConfig, useDados } from "./components/ui";
import { LancamentoForm, type Rascunho } from "./components/LancamentoForm";
import { LerConta } from "./components/LerConta";
import { Assistente } from "./components/Assistente";
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
const TITULO: Record<Aba, string> = { inicio: "", lancamentos: "Lançamentos", relatorios: "Relatórios", pessoas: "Pessoas", mais: "Mais" };

/** Texto claro ou escuro conforme a luminância da cor de destaque. */
function corTexto(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160 ? "#14211b" : "#ffffff";
}

export default function App() {
  const [preparado, setPreparado] = useState(false);
  const [erroBanco, setErroBanco] = useState("");
  useEffect(() => { prepararBanco().then(() => setPreparado(true)).catch((e) => setErroBanco(String(e?.message ?? e))); }, []);

  const dados = useDados();
  const [empresa] = useConfig("empresa", "Minha empresa");
  const [logo] = useConfig<string>("logo", "");
  const [cor] = useConfig("cor", "#0f3d2e");
  const [tema] = useConfig<"sistema" | "claro" | "escuro">("tema", "sistema");

  const [aba, setAba] = useState<Aba>(() => {
    const h = location.hash.slice(1) as Aba;
    return ABAS.some(([k]) => k === h) ? h : "inicio";
  });
  const [secao, setSecao] = useState<Secao>("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [fotoNova, setFotoNova] = useState<Blob>();
  const [lerAberto, setLerAberto] = useState(false);
  const [assistAberto, setAssistAberto] = useState(false);

  useEffect(() => { history.replaceState(null, "", `#${aba}`); window.scrollTo(0, 0); }, [aba]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-base", cor);
    root.style.setProperty("--accent-ink-base", corTexto(cor));
    if (tema === "sistema") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", tema);
  }, [cor, tema]);
  useEffect(() => { document.title = empresa === "Minha empresa" ? "Financeiro" : `Financeiro · ${empresa}`; }, [empresa]);

  const abrir = (l: Lancamento) => { setFotoNova(undefined); setRascunho(l); };
  const novo = () => { setFotoNova(undefined); setRascunho({ tipo: "despesa" }); };

  if (erroBanco) return <div className="conteudo"><div className="aviso neg">Não foi possível abrir os dados deste aparelho ({erroBanco}). Se estiver em uma janela anônima, abra numa janela normal.</div></div>;
  if (!preparado || !dados.pronto) return <div className="conteudo" style={{ placeItems: "center", minHeight: "60vh" }}><span className="carregando" aria-label="Carregando" /></div>;

  return (
    <div className="app">
      <nav className="nav" aria-label="Seções">
        {ABAS.map(([k, nome, I]) => (
          <button key={k} type="button" aria-current={aba === k ? "page" : undefined} onClick={() => { setAba(k); setSecao(""); }}><I aria-hidden />{nome}</button>
        ))}
      </nav>
      <main className="conteudo">
        <header className="topo">
          <div className="logo">{logo ? <img src={logo} alt="" /> : empresa.slice(0, 1).toUpperCase()}</div>
          <div>
            <h1>{TITULO[aba] || empresa}</h1>
            <div className="sub">{aba === "inicio" ? mesExtenso(mesAtual()).replace(/^./, (c) => c.toUpperCase()) : empresa}</div>
          </div>
          <div className="acoes">
            <button type="button" className="btn icone" aria-label="Ler conta por foto" onClick={() => setLerAberto(true)}><ScanText /></button>
            <button type="button" className="btn icone" aria-label="Abrir assistente" onClick={() => setAssistAberto(true)}><MessageCircle /></button>
          </div>
        </header>

        {aba === "inicio" && <Inicio dados={dados} abrir={abrir} lerConta={() => setLerAberto(true)} assistente={() => setAssistAberto(true)} irFechamento={() => { setAba("mais"); setSecao("fechamento"); }} />}
        {aba === "lancamentos" && <Lancamentos dados={dados} abrir={abrir} />}
        {aba === "relatorios" && <Relatorios dados={dados} />}
        {aba === "pessoas" && <Pessoas dados={dados} abrir={abrir} />}
        {aba === "mais" && <Mais dados={dados} secao={secao} setSecao={setSecao} />}
      </main>

      <button type="button" className="fab" aria-label="Novo lançamento" onClick={novo}><Plus /></button>

      <LancamentoForm rascunho={rascunho} fotoNova={fotoNova} dados={dados} fechar={() => { setRascunho(null); setFotoNova(undefined); }} />
      <LerConta aberta={lerAberto} fechar={() => setLerAberto(false)} dados={dados} aoLer={(r, foto) => { setLerAberto(false); setFotoNova(foto); setRascunho(r); }} />
      <Assistente aberta={assistAberto} fechar={() => setAssistAberto(false)} dados={dados} />
    </div>
  );
}
