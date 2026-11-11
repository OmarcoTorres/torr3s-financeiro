import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Leaf, PiggyBank, HeartPulse } from "lucide-react";
import App from "../App";
import { Login } from "../components/Login";
import { supabase } from "../lib/supabase";
import { irPara, moduloDaUrl, moduloSalvo, type Modulo } from "./modulos";

const KayaApp = lazy(() => import("../modules/kaya/KayaApp"));

/** Porta de entrada: decide o módulo pela URL. "/" continua abrindo o Invest+ (quem já usa não percebe diferença). */
export function Raiz() {
  const rota = moduloDaUrl();
  if (rota === null) {
    const salvo = moduloSalvo();
    if (salvo && salvo !== "invest") { location.replace(salvo === "kaya" ? "/kaya" : "/vida"); return null; }
    return <App />;
  }
  if (rota === "invest") { history.replaceState(null, "", "/" + location.hash); return <App />; }
  return <ComSessao rota={rota} />;
}

function ComSessao({ rota }: { rota: Modulo | "seletor" }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (sessao === undefined) return <div className="conteudo" style={{ justifyItems: "center", minHeight: "60vh", alignContent: "center" }}><span className="carregando" aria-label="Carregando" /></div>;
  // Só para conferência local das telas (VITE_SEM_LOGIN=1 no build); nunca configurado na Vercel.
  if (import.meta.env.VITE_SEM_LOGIN === "1" && rota === "kaya") return <Suspense fallback={null}><KayaApp userId="00000000-0000-0000-0000-000000000001" trocarModulo={() => irPara("seletor")} /></Suspense>;
  if (rota === "kaya") {
    if (!sessao) return <div className="kaya-login"><Login marca="Kaya Life" /></div>;
    return <Suspense fallback={null}><KayaApp userId={sessao.user.id} trocarModulo={() => irPara("seletor")} /></Suspense>;
  }
  if (!sessao) return <Login marca="sua conta" />;
  if (rota === "vida") return <Seletor aviso="O Vida+ chega em breve. Por enquanto, escolha outro módulo." />;
  return <Seletor />;
}

/** Tela prévia: a pessoa escolhe o módulo. A escolha fica lembrada neste aparelho. */
export function Seletor({ aviso }: { aviso?: string }) {
  const op: [Modulo, string, string, typeof Leaf, boolean][] = [
    ["invest", "Invest+", "Finanças do dia a dia, metas e grupo.", PiggyBank, true],
    ["vida", "Vida+", "Hábitos, remédios, medidas e treinos. Em breve.", HeartPulse, false],
    ["kaya", "Kaya Life", "Registro e controle pessoal, cifrado. 18+.", Leaf, true],
  ];
  return (
    <div className="boasvindas">
      <div className="corpo" style={{ gap: 14 }}>
        <h1>O que você quer abrir?</h1>
        <p className="lead">Uma conta só para todos. Você pode trocar quando quiser.</p>
        {aviso && <div className="aviso warn">{aviso}</div>}
        {op.map(([m, nome, txt, I, ativo]) => (
          <button key={m} type="button" className="card" disabled={!ativo} onClick={() => irPara(m)}
            style={{ textAlign: "left", display: "flex", gap: 14, alignItems: "center", cursor: ativo ? "pointer" : "default", opacity: ativo ? 1 : 0.55, border: 0, font: "inherit", color: "inherit" }}>
            <I size={28} aria-hidden /><span style={{ display: "grid", gap: 2 }}><b>{nome}</b><span className="muted" style={{ fontSize: ".88rem" }}>{txt}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}
