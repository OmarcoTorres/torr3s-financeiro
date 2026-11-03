import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Copy, Download, MonitorSmartphone, MoreVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import { supabase } from "../lib/supabase";
import { ativarPush, assinaturaAtual, desativarPush, enviarTeste, instalado, plataforma, pushSuportado } from "../lib/push";
import { Seg, useAviso } from "./ui";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function Passo({ n, icone, children }: { n: number; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="passo-guia">
      <span className="num-guia">{n}</span>
      <div>{children}</div>
      <span className="ic-guia" aria-hidden>{icone}</span>
    </div>
  );
}

/** Passo a passo para instalar o Invest+ como app, conforme o aparelho. */
export function GuiaInstalacao({ irNotificacoes }: { irNotificacoes?: () => void }) {
  const aviso = useAviso();
  const p = plataforma();
  const [convite, setConvite] = useState<EventoInstalar | null>(() => ((window as unknown as { __instalar?: EventoInstalar }).__instalar ?? null));
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setConvite(e as EventoInstalar); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);

  if (instalado()) {
    return (
      <>
        <div className="bloco" style={{ justifyItems: "start" }}>
          <CheckCircle2 size={28} style={{ color: "var(--pos)" }} />
          <b>O Invest+ já está instalado neste aparelho.</b>
          <span className="muted" style={{ fontSize: ".88rem" }}>Ele abre pelo ícone na tela de início, em tela cheia, como os outros apps.</span>
        </div>
        {irNotificacoes && <button type="button" className="btn pri grande" onClick={irNotificacoes}><Bell />Ativar lembretes de vencimento</button>}
      </>
    );
  }

  return (
    <>
      <p className="muted">Instalado, o Invest+ ganha um ícone na tela de início, abre em tela cheia e pode avisar de vencimentos, faturas e metas.</p>

      {p === "ios-safari" && (
        <div className="card guia" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <Passo n={1} icone={<Share size={20} />}>Toque em <b>Compartilhar</b> na barra do Safari (o quadrado com a seta para cima).</Passo>
          <Passo n={2} icone={<PlusSquare size={20} />}>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</Passo>
          <Passo n={3} icone={<Smartphone size={20} />}>Toque em <b>Adicionar</b>. Depois, abra o Invest+ pelo ícone novo.</Passo>
        </div>
      )}

      {p === "ios-outro" && (
        <div className="aviso warn"><Smartphone /><div>
          No iPhone, só o <b>Safari</b> instala apps assim. Copie o endereço, abra no Safari e siga os passos que aparecem lá.
          <div className="linha-botoes"><button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(location.origin); aviso("Endereço copiado."); } catch { aviso(location.origin); } }}><Copy />Copiar endereço</button></div>
        </div></div>
      )}

      {p === "android" && (convite ? (
        <button type="button" className="btn pri grande" onClick={async () => { await convite.prompt(); const r = await convite.userChoice; if (r.outcome === "accepted") aviso("Invest+ instalado."); setConvite(null); }}><Download />Instalar o app</button>
      ) : (
        <div className="card guia" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <Passo n={1} icone={<MoreVertical size={20} />}>No Chrome, toque no menu <b>⋮</b> no canto de cima.</Passo>
          <Passo n={2} icone={<Download size={20} />}>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</Passo>
          <Passo n={3} icone={<Smartphone size={20} />}>Confirme. O Invest+ aparece junto dos seus aplicativos.</Passo>
        </div>
      ))}

      {p === "desktop" && (convite ? (
        <button type="button" className="btn pri grande" onClick={async () => { await convite.prompt(); setConvite(null); }}><Download />Instalar no computador</button>
      ) : (
        <div className="card guia" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <Passo n={1} icone={<MonitorSmartphone size={20} />}>No Chrome ou Edge: clique no ícone de <b>instalar</b> no fim da barra de endereço.</Passo>
          <Passo n={2} icone={<PlusSquare size={20} />}>No Safari do Mac: menu <b>Arquivo › Adicionar ao Dock</b>.</Passo>
          <Passo n={3} icone={<Smartphone size={20} />}>No celular: abra <b>{location.host}</b> e use este mesmo guia em Ajustes.</Passo>
        </div>
      ))}

      {p === "ios-safari" && <p className="muted" style={{ fontSize: ".84rem" }}>No iPhone, as notificações só funcionam com o app instalado (iOS 16.4 ou mais novo).</p>}
    </>
  );
}

type Prefs = { ativo: boolean; vencimentos: boolean; dias_antes: number; atrasadas: boolean; faturas: boolean; metas: boolean; resumo_semanal: boolean };
const PADRAO: Prefs = { ativo: true, vencimentos: true, dias_antes: 2, atrasadas: true, faturas: true, metas: true, resumo_semanal: true };

/** Ativar notificações neste aparelho e escolher o que receber. */
export function Notificacoes({ userId, irInstalar }: { userId: string; irInstalar: () => void }) {
  const aviso = useAviso();
  const [ativoAqui, setAtivoAqui] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");
  const p = plataforma();
  const precisaInstalar = (p === "ios-safari" || p === "ios-outro") && !instalado();
  const bloqueado = pushSuportado() && Notification.permission === "denied";

  useEffect(() => {
    assinaturaAtual().then((s) => setAtivoAqui(!!s)).catch(() => setAtivoAqui(false));
    supabase.from("notificacoes_prefs").select("*").eq("user_id", userId).maybeSingle().then(({ data }) => setPrefs({ ...PADRAO, ...(data ?? {}) }));
  }, [userId]);

  async function salvarPrefs(nova: Prefs) {
    setPrefs(nova);
    const { error } = await supabase.from("notificacoes_prefs").upsert({ user_id: userId, ...nova, atualizado_em: new Date().toISOString() });
    if (error) setErro(error.message);
  }
  async function rodar(fn: () => Promise<unknown>, ok?: string) {
    setTrabalhando(true); setErro("");
    try { await fn(); if (ok) aviso(ok); } catch (e) { setErro(String((e as Error)?.message ?? e)); } finally { setTrabalhando(false); }
  }

  if (precisaInstalar) {
    return (
      <>
        <div className="aviso warn"><Smartphone /><div>No iPhone, as notificações só funcionam com o Invest+ <b>instalado na tela de início</b>. Leva 10 segundos.</div></div>
        <button type="button" className="btn pri grande" onClick={irInstalar}><Download />Ver como instalar</button>
      </>
    );
  }
  if (!pushSuportado()) return <div className="aviso warn"><BellOff /><div>Este navegador não recebe notificações. Use o Chrome, o Edge, o Safari (Mac) ou o app instalado.</div></div>;

  const toggle = (k: keyof Prefs, rotulo: string, sub: string) => (
    <label className="linha-toggle" key={k}>
      <span><b>{rotulo}</b><small>{sub}</small></span>
      <input type="checkbox" className="interruptor" checked={!!prefs?.[k]} onChange={(e) => prefs && salvarPrefs({ ...prefs, [k]: e.target.checked })} />
    </label>
  );

  return (
    <>
      <div className="bloco">
        <div className="cab"><b>Neste aparelho</b>{ativoAqui ? <span className="chip">ativas</span> : <span className="pill pendente">desligadas</span>}</div>
        {bloqueado ? (
          <span className="muted" style={{ fontSize: ".86rem" }}>As notificações foram bloqueadas. Libere nos ajustes do {p === "desktop" ? "navegador" : "celular"} para o Invest+ e volte aqui.</span>
        ) : ativoAqui ? (
          <div className="linha-botoes">
            <button type="button" className="btn suave" disabled={trabalhando} onClick={() => rodar(enviarTeste, "Notificação de teste enviada.")}><Bell />Enviar teste</button>
            <button type="button" className="btn fantasma" disabled={trabalhando} onClick={() => rodar(async () => { await desativarPush(); setAtivoAqui(false); }, "Notificações desligadas neste aparelho.")}>Desligar aqui</button>
          </div>
        ) : (
          <button type="button" className="btn pri" disabled={trabalhando} onClick={() => rodar(async () => { await ativarPush(userId); setAtivoAqui(true); if (prefs && !prefs.ativo) await salvarPrefs({ ...prefs, ativo: true }); }, "Notificações ativadas.")}><Bell />Ativar notificações</button>
        )}
        <span className="muted" style={{ fontSize: ".8rem" }}>Os lembretes chegam todo dia às 8h, só quando há algo para avisar.</span>
      </div>

      {prefs && (
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)", gap: 4 }}>
          {toggle("vencimentos", "Contas a vencer", "No dia e com antecedência, a pagar e a receber")}
          {prefs.vencimentos && (
            <div style={{ padding: "4px 0 10px", display: "grid", gap: 6 }}>
              <span className="muted" style={{ fontSize: ".8rem" }}>Avisar com antecedência de:</span>
              <Seg rotulo="Antecedência" valor={String(prefs.dias_antes)} mudar={(v) => salvarPrefs({ ...prefs, dias_antes: Number(v) })}
                opcoes={[["0", "No dia"], ["1", "1 dia"], ["2", "2 dias"], ["5", "5 dias"]]} />
            </div>
          )}
          {toggle("atrasadas", "Contas atrasadas", "No dia seguinte ao vencimento e às segundas")}
          {toggle("faturas", "Faturas de cartão", "3 dias antes e no dia do vencimento")}
          {toggle("metas", "Prazos de metas", "No começo do mês do prazo e no mês anterior")}
          {toggle("resumo_semanal", "Resumo da semana", "Segunda-feira: o que vence nos próximos 7 dias")}
          {toggle("ativo", "Todas as notificações", "Desligue para pausar em todos os seus aparelhos")}
        </div>
      )}
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
    </>
  );
}
