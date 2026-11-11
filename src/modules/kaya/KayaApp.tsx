import { Fragment, useEffect, useState } from "react";
import { BookHeart, Cloud, CloudOff, History, LayoutGrid, LineChart, Lock, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { Folha } from "../../components/ui";
import { abrirCofre, bloquear, sincronizar, useKaya } from "./dados";
import { Cofre } from "./Cofre";
import { Onboarding } from "./Onboarding";
import { Inicio } from "./Inicio";
import { Registros } from "./Registros";
import { DiarioTela, Insights, NovoDiario, PausaConsciente, Registrar, perfilDe } from "./Telas";
import { Mais, type Sec } from "./Mais";
import { NOME, Termo } from "./textos";
import "./kaya.css";

type Aba = "inicio" | "registros" | "insights" | "diario" | "mais";
const ABAS: [Aba, string, typeof LayoutGrid][] = [["inicio", "Início", LayoutGrid], ["registros", "Registros", History], ["insights", "Insights", LineChart], ["diario", "Diário", BookHeart], ["mais", "Mais", MoreHorizontal]];
export type Folhas = "registrar" | "pausa" | "diario" | null;

/** Kaya Life: módulo isolado. Recebe só o usuário logado da plataforma; cofre, dados e tema são dele. */
export default function KayaApp({ userId, trocarModulo }: { userId: string; trocarModulo: () => void }) {
  const k = useKaya();
  const [aba, setAba] = useState<Aba>(() => (ABAS.some(([a]) => `#${a}` === location.hash) ? (location.hash.slice(1) as Aba) : "inicio"));
  const [secao, setSecao] = useState<Sec>("");
  const [folha, setFolha] = useState<Folhas>(null);
  useEffect(() => {
    void abrirCofre(userId);
    document.title = NOME;
    if (!document.getElementById("kaya-fontes")) {
      const l = document.createElement("link"); l.id = "kaya-fontes"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(l);
    }
  }, [userId]);
  useEffect(() => { history.replaceState(null, "", `#${aba}`); window.scrollTo(0, 0); }, [aba]);
  const perfil = perfilDe(k.itens);
  const ir = (a: Aba, s: Sec = "") => { setAba(a); setSecao(s); };

  if (k.cofre === "carregando") return <div className="kaya"><div className="conteudo" style={{ justifyItems: "center", minHeight: "60vh", alignContent: "center" }}><span className="carregando" aria-label="Carregando" /></div></div>;
  if (k.cofre === "novo" || (k.cofre === "aberto" && !perfil)) return <div className="kaya"><Onboarding /></div>;
  if (k.cofre !== "aberto") return (
    <div className="kaya"><div className="kaya-portao">
      <img src="/kaya/logo.jpg" alt={NOME} className="kaya-logo-grande" />
      <Cofre />
      <button type="button" className="btn fantasma" onClick={trocarModulo}>Trocar de módulo</button>
    </div></div>
  );

  const p = perfil!;
  const titulo = aba === "inicio" ? `Olá${p.apelido ? `, ${p.apelido}` : ""}` : ABAS.find((a) => a[0] === aba)![1];
  const sub = aba === "inicio" ? new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) : `${NOME} · ${Termo(p)}`;
  const Nuvem = k.soLocal ? CloudOff : k.sync === "enviando" ? RefreshCw : k.sync === "ok" ? Cloud : CloudOff;
  return (
    <div className="kaya">
      <div className="app">
        <nav className="nav" aria-label="Seções">
          <div className="marca"><img src="/kaya/emblema.jpg" alt="" />{NOME}</div>
          {ABAS.map(([id, nome, I]) => (
            <Fragment key={id}>
              {id === "mais" && <div className="sep" />}
              <button type="button" aria-current={aba === id ? "page" : undefined} onClick={() => ir(id)}><I aria-hidden />{nome}</button>
            </Fragment>
          ))}
        </nav>
        <main className="conteudo">
          <header className="topo">
            <div className="logo"><img src="/kaya/emblema.jpg" alt="" /></div>
            <div style={{ minWidth: 0 }}><h1>{titulo}</h1><div className="sub">{sub}</div></div>
            <div className="acoes">
              <button type="button" className="btn icone" title={k.soLocal ? "Só neste aparelho" : k.sync === "ok" ? "Cifrado e salvo na nuvem" : k.sync === "offline" ? "Sem internet: salvo neste aparelho" : k.sync === "erro" ? `Não sincronizou (${k.erro ?? ""})` : "Sincronizando"}
                aria-label="Estado da sincronização" style={{ color: k.sync === "erro" ? "var(--neg)" : "var(--accent)" }} onClick={() => void sincronizar()}><Nuvem className={k.sync === "enviando" ? "girando" : undefined} /></button>
              <button type="button" className="btn icone" aria-label="Bloquear agora" title="Bloquear agora" onClick={bloquear}><Lock /></button>
            </div>
          </header>
          {aba === "inicio" && <Inicio abrir={setFolha} ir={ir} />}
          {aba === "registros" && <Registros novo={() => setFolha("registrar")} />}
          {aba === "insights" && <Insights />}
          {aba === "diario" && <DiarioTela novo={() => setFolha("diario")} />}
          {aba === "mais" && <Mais secao={secao} setSecao={setSecao} sair={trocarModulo} />}
        </main>
        {aba !== "mais" && <button type="button" className="fab" aria-label="Registrar" onClick={() => setFolha("registrar")}><Plus /><span>Registrar</span></button>}
      </div>
      <Folha titulo="Registrar" aberta={folha === "registrar"} fechar={() => setFolha(null)}><Registrar fechar={() => setFolha(null)} pausar={() => setFolha("pausa")} /></Folha>
      <Folha titulo="Pausa consciente" aberta={folha === "pausa"} fechar={() => setFolha(null)}><PausaConsciente fechar={() => setFolha(null)} /></Folha>
      <Folha titulo="Escrever no diário" aberta={folha === "diario"} fechar={() => setFolha(null)}><NovoDiario fechar={() => setFolha(null)} /></Folha>
    </div>
  );
}
