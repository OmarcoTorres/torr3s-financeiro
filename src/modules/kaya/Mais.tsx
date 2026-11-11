import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, HeartHandshake, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { ID_PERFIL, bloquear, definirSoLocal, excluirTudo, exportar, salvar, trocarPin, useKaya } from "./dados";
import { Chips, Secao } from "./pecas";
import { APOIO, APRENDER, DISCLAIMER, FAQ, OP, PRINCIPIO, ROTULO_PERFIL, termo } from "./textos";
import { Gastos, Medicinal, Pacto, perfilDe } from "./Telas";
import type { Perfil, PerfilUso } from "./tipos";

type Sec = "" | "perfil" | "pacto" | "gastos" | "medicinal" | "aprender" | "faq" | "apoio" | "privacidade";

export function Mais({ sair }: { sair: () => void }) {
  const { itens } = useKaya();
  const p = perfilDe(itens)!;
  const [sec, setSec] = useState<Sec>("");
  const medicinal = p.saude.length > 0 || p.perfilUso === "medicinal" || p.perfilUso === "misto";
  const itensMenu: [Sec, string][] = [["perfil", "Meu perfil e intenção"], ["pacto", "Pacto pessoal"], ["gastos", "Gastos e orçamento"], ...(medicinal ? [["medicinal", "Modo medicinal"] as [Sec, string]] : []),
    ["aprender", "Aprender"], ["faq", "Perguntas frequentes"], ["apoio", "Apoio"], ["privacidade", "Privacidade e segurança"]];
  if (sec) return (
    <>
      <button type="button" className="btn fantasma" style={{ justifySelf: "start" }} onClick={() => setSec("")}><ChevronLeft />Mais</button>
      {sec === "perfil" && <MeuPerfil p={p} />}
      {sec === "pacto" && <Pacto />}
      {sec === "gastos" && <Gastos />}
      {sec === "medicinal" && <Medicinal />}
      {sec === "aprender" && <Secao titulo="Aprender">{APRENDER.map((a) => <details key={a.titulo}><summary>{a.titulo}</summary><p>{a.texto}</p></details>)}</Secao>}
      {sec === "faq" && <Secao titulo="Perguntas frequentes"><div className="aviso dica"><ShieldCheck /><div><b>{PRINCIPIO}</b></div></div>{FAQ.map((f) => <details key={f.p}><summary>{f.p}</summary><p>{f.r.replace("{t}", termo(p))}</p></details>)}</Secao>}
      {sec === "apoio" && <Apoio />}
      {sec === "privacidade" && <Privacidade />}
      <p className="kaya-disclaimer">{DISCLAIMER}</p>
    </>
  );
  return (
    <>
      <Secao titulo="Mais"><div className="kaya-lista">{itensMenu.map(([k, n]) => <button key={k} type="button" className="btn fantasma" style={{ justifyContent: "space-between", color: "var(--ink)" }} onClick={() => setSec(k)}>{n}<ChevronRight /></button>)}</div></Secao>
      <div className="linha-botoes"><button type="button" className="btn" onClick={bloquear}><Lock />Bloquear agora</button><button type="button" className="btn fantasma" onClick={sair}>Trocar de módulo</button></div>
      <p className="kaya-disclaimer">{PRINCIPIO}</p>
    </>
  );
}

function MeuPerfil({ p }: { p: Perfil }) {
  const [x, setX] = useState(p);
  const [ok, setOk] = useState(false);
  return (
    <Secao titulo="Meu perfil e intenção">
      <label className="campo"><span>Apelido</span><input value={x.apelido} maxLength={30} onChange={(e) => setX({ ...x, apelido: e.target.value })} /></label>
      <label className="campo"><span>Como você chama a planta</span><input value={x.termo} maxLength={20} onChange={(e) => setX({ ...x, termo: e.target.value })} /></label>
      <label className="campo"><span>Sua intenção (norte)</span><textarea rows={2} maxLength={140} value={x.norte} onChange={(e) => setX({ ...x, norte: e.target.value })} /></label>
      <div className="campo"><span>Perfil (muda as telas e o tom; o histórico continua)</span><Chips rotulo="Perfil de uso" ops={Object.entries(ROTULO_PERFIL) as [PerfilUso, string][]} valor={x.perfilUso} mudar={(v) => v && setX({ ...x, perfilUso: v as PerfilUso })} /></div>
      <div className="campo"><span>Finalidades de saúde</span><div className="kaya-chips">{OP.saude.map(([k, n]) => <button key={k} type="button" className="kaya-chip" aria-pressed={x.saude.includes(k)} onClick={() => setX({ ...x, saude: x.saude.includes(k) ? x.saude.filter((y) => y !== k) : [...x.saude, k] })}>{n}</button>)}</div></div>
      <button type="button" className="btn pri" onClick={() => void salvar<Perfil>({ ...x, termo: x.termo.trim() || "kaya" }, ID_PERFIL).then(() => setOk(true))}>Salvar</button>
      {ok && <span className="pos">Salvo.</span>}
    </Secao>
  );
}

function Apoio() {
  const [contatos, setContatos] = useState(() => { try { return localStorage.getItem("kaya:contato") ?? ""; } catch { return ""; } });
  return (
    <Secao titulo="Apoio">
      <div className="aviso dica"><HeartHandshake /><div>Pedir ajuda é um gesto de cuidado. Estes serviços são gratuitos e sigilosos.</div></div>
      <div className="kaya-lista">{APOIO.map((a) => <a key={a.nome} href={a.link} target={a.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}><b>{a.nome}</b><br /><small className="muted">{a.detalhe}</small></a>)}</div>
      <label className="campo"><span>Uma pessoa de confiança (fica só neste aparelho)</span><input value={contatos} maxLength={80} placeholder="Nome e telefone" onChange={(e) => { setContatos(e.target.value); try { localStorage.setItem("kaya:contato", e.target.value); } catch { /* ignora */ } }} /></label>
      <details><summary>Autoavaliação (não é diagnóstico)</summary>
        <p>Pergunte-se com calma: tenho usado mais do que pretendia? Já tentei diminuir e não consegui? Deixei de fazer coisas importantes? Uso para lidar com dias difíceis quase sempre? Se várias respostas forem "sim", conversar com um profissional pode ajudar. Não há certo ou errado aqui.</p>
      </details>
    </Secao>
  );
}

function Privacidade() {
  const k = useKaya();
  const [pa, setPa] = useState(""), [pn, setPn] = useState(""), [msg, setMsg] = useState(""), [confirma, setConfirma] = useState("");
  const rodar = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); try { await fn(); setMsg(ok); } catch (e) { setMsg(String((e as Error).message)); } };
  return (
    <>
      <Secao titulo="Como seus dados são protegidos">
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>Tudo é cifrado <b>neste aparelho</b> (AES-256-GCM) antes de ser salvo.</li>
          <li>Na nuvem fica só um bloco ilegível. Nem o tipo do registro aparece. A equipe do app não consegue ler.</li>
          <li>O PIN nunca sai do aparelho. O código de recuperação é só seu.</li>
          <li>Bloqueio automático após 2 minutos fora do app ou 10 minutos parado.</li>
          <li>Nada do Kaya Life vai para grupos, Invest+ ou Vida+.</li>
        </ul>
        <span className="muted">Sincronização: {k.soLocal ? "desligada (só neste aparelho)" : k.sync === "ok" ? "em dia" : k.sync === "enviando" ? "enviando…" : k.sync === "offline" ? "sem internet" : `erro (${k.erro ?? ""})`}</span>
      </Secao>
      <Secao titulo="Só neste aparelho">
        <label className="linha-toggle"><span><b>Guardar só neste aparelho</b><small>Ao ligar, apagamos da nuvem os blocos e o cofre. Se perder o aparelho, perde os dados.</small></span>
          <input type="checkbox" className="interruptor" checked={k.soLocal} onChange={(e) => void rodar(() => definirSoLocal(e.target.checked), e.target.checked ? "Pronto: nada mais vai para a nuvem." : "Sincronização cifrada ligada.")} /></label>
      </Secao>
      <Secao titulo="Trocar PIN">
        <input type="password" inputMode="numeric" placeholder="PIN atual" value={pa} onChange={(e) => setPa(e.target.value.replace(/\D/g, ""))} aria-label="PIN atual" />
        <input type="password" inputMode="numeric" placeholder="PIN novo (6 a 12 números)" value={pn} onChange={(e) => setPn(e.target.value.replace(/\D/g, ""))} aria-label="PIN novo" />
        <button type="button" className="btn" disabled={pa.length < 6 || pn.length < 6} onClick={() => void rodar(() => trocarPin(pa, pn).then(() => { setPa(""); setPn(""); }), "PIN trocado.")}>Trocar</button>
      </Secao>
      <Secao titulo="Levar ou apagar">
        <button type="button" className="btn" onClick={exportar}><Download />Exportar meus dados (JSON)</button>
        <small className="muted">O arquivo exportado NÃO é cifrado. Guarde com cuidado.</small>
        <label className="campo"><span>Para excluir tudo, digite EXCLUIR</span><input value={confirma} onChange={(e) => setConfirma(e.target.value)} /></label>
        <button type="button" className="btn perigo" disabled={confirma !== "EXCLUIR"} onClick={() => void rodar(excluirTudo, "Tudo excluído.")}><Trash2 />Excluir tudo do Kaya Life</button>
      </Secao>
      {msg && <div className="aviso dica" role="status">{msg}</div>}
    </>
  );
}
