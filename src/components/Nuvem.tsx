import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, Sparkles, X } from "lucide-react";
import { explicarSync, sincronizarAgora, useSync } from "../lib/sync";
import { aplicarVersaoNova, useVersaoNova } from "../lib/versao";
import { useAviso } from "./ui";

const COR = { ok: "var(--pos)", warn: "var(--warn)", neg: "var(--neg)", neutro: "var(--muted)" } as const;
const FUNDO = { ok: "var(--pos-soft)", warn: "var(--warn-soft)", neg: "var(--neg-soft)", neutro: "var(--surface-2)" } as const;

function haQuanto(ms?: number) {
  if (!ms) return "";
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  return `às ${new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Ícone da nuvem no topo: cor pelo estado, número de mudanças na fila, toque sincroniza e explica. */
export function IndicadorSync() {
  const s = useSync();
  const aviso = useAviso();
  const e = explicarSync(s);
  const I = s.status === "sincronizando" ? RefreshCw : s.status === "ok" ? Cloud : CloudOff;
  return (
    <button type="button" className="btn icone" style={{ color: COR[e.tom], position: "relative" }} title={`${e.titulo}. ${e.texto}`} aria-label={e.titulo}
      onClick={() => { aviso(s.status === "ok" ? "Tudo salvo na nuvem." : e.titulo); void sincronizarAgora(); }}>
      <I className={s.status === "sincronizando" ? "girando" : undefined} />
      {s.pendentes > 0 && s.status !== "sincronizando" && <span className="badge-icone" style={{ background: COR[e.tom] }}>{s.pendentes > 99 ? "99+" : s.pendentes}</span>}
    </button>
  );
}

/** Cartão "Nuvem" em Ajustes: o que está acontecendo, em português, e o detalhe técnico só se pedir. */
export function StatusNuvem() {
  const s = useSync();
  const e = explicarSync(s);
  const [, tique] = useState(0);
  useEffect(() => { const t = setInterval(() => tique((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  const I = s.status === "sincronizando" ? RefreshCw : s.status === "ok" ? Cloud : CloudOff;
  return (
    <div className="nuvem" style={{ background: FUNDO[e.tom] }}>
      <span className="nuvem-icone" style={{ color: COR[e.tom] }}><I className={s.status === "sincronizando" ? "girando" : undefined} /></span>
      <div className="nuvem-texto">
        <b>{e.titulo}</b>
        <span>{e.texto}</span>
        {s.ultimaSync && <span className="muted" style={{ fontSize: ".78rem" }}>Última sincronização {haQuanto(s.ultimaSync)}</span>}
        {s.status === "erro" && s.erro && (
          <details className="nuvem-detalhe"><summary>Detalhes técnicos</summary><code>{s.erro}</code></details>
        )}
      </div>
      <button type="button" className="btn" disabled={s.status === "sincronizando"} onClick={() => void sincronizarAgora()}>
        {s.status === "sincronizando" ? "Sincronizando…" : "Sincronizar agora"}
      </button>
    </div>
  );
}

/** Faixa "versão nova pronta": a pessoa aplica quando quiser; sem resposta, entra ao fechar o app. */
export function BannerVersao() {
  const pronta = useVersaoNova();
  const [depois, setDepois] = useState(false);
  if (!pronta || depois) return null;
  return (
    <div className="banner-versao" role="status">
      <Sparkles aria-hidden />
      <span><b>Versão nova pronta.</b> Atualizar leva 2 segundos e não perde nada.</span>
      <button type="button" className="btn pri" onClick={() => void aplicarVersaoNova()}>Atualizar</button>
      <button type="button" className="fechar" aria-label="Depois" title="Depois (atualiza sozinho ao fechar o app)" onClick={() => setDepois(true)}><X /></button>
    </div>
  );
}
