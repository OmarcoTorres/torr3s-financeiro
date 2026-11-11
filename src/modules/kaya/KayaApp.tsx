import { useEffect, useState } from "react";
import { BookHeart, Home as IcHome, LineChart, MoreHorizontal, Wind } from "lucide-react";
import { abrirCofre, useKaya } from "./dados";
import { Cofre } from "./Cofre";
import { Onboarding } from "./Onboarding";
import { DiarioTela, Home, Insights, PausaConsciente, Registrar, perfilDe } from "./Telas";
import { Mais } from "./Mais";
import { NOME } from "./textos";
import "./kaya.css";

type Aba = "inicio" | "pausa" | "diario" | "insights" | "mais";
const ABAS: [Aba, string, typeof IcHome][] = [["inicio", "Início", IcHome], ["pausa", "Pausa", Wind], ["diario", "Diário", BookHeart], ["insights", "Insights", LineChart], ["mais", "Mais", MoreHorizontal]];

/** Kaya Life: módulo isolado. Recebe só o usuário logado da plataforma; tudo o mais é dele (cofre, dados, tema). */
export default function KayaApp({ userId, trocarModulo }: { userId: string; trocarModulo: () => void }) {
  const k = useKaya();
  const [aba, setAba] = useState<Aba>("inicio");
  const [registrando, setRegistrando] = useState(false);
  const [toque, setToque] = useState(0); // tocar na aba de novo volta ao começo dela
  useEffect(() => {
    void abrirCofre(userId);
    document.title = NOME;
    if (!document.getElementById("kaya-fontes")) {
      const l = document.createElement("link"); l.id = "kaya-fontes"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&display=swap";
      document.head.appendChild(l);
    }
  }, [userId]);
  const perfil = perfilDe(k.itens);

  let corpo;
  if (k.cofre === "carregando") corpo = <div className="kaya-conteudo"><span className="carregando" aria-label="Carregando" /></div>;
  else if (k.cofre === "novo" || (k.cofre === "aberto" && !perfil)) return <div className="kaya"><Onboarding /></div>;
  else if (k.cofre !== "aberto") corpo = <div className="kaya-conteudo"><div className="kaya-topo"><h1>{NOME}</h1><button type="button" className="btn fantasma" onClick={trocarModulo}>Módulos</button></div><Cofre /></div>;
  else corpo = (
    <>
      <main className="kaya-conteudo">
        <div className="kaya-topo"><h1>{aba === "inicio" ? `Olá${perfil!.apelido ? `, ${perfil!.apelido}` : ""}` : ABAS.find((a) => a[0] === aba)![1]}</h1></div>
        {registrando ? <Registrar fechar={() => setRegistrando(false)} /> : (
          <>
            {aba === "inicio" && <Home registrar={() => setRegistrando(true)} pausar={() => setAba("pausa")} />}
            {aba === "pausa" && <PausaConsciente />}
            {aba === "diario" && <DiarioTela />}
            {aba === "insights" && <Insights />}
            {aba === "mais" && <Mais key={toque} sair={trocarModulo} />}
          </>
        )}
      </main>
      <nav className="kaya-nav" aria-label="Seções">{ABAS.map(([id, nome, I]) => <button key={id} type="button" aria-current={aba === id && !registrando ? "page" : undefined} onClick={() => { setRegistrando(false); setAba(id); setToque((n) => n + 1); }}><I aria-hidden />{nome}</button>)}</nav>
    </>
  );
  return <div className="kaya">{corpo}</div>;
}
