import { useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { criarCofre, desbloquear, recuperar, useKaya } from "./dados";
import { NOME } from "./textos";

const pinValido = (p: string) => /^\d{6,12}$/.test(p) && !/^(\d)\1+$/.test(p) && !"0123456789012".includes(p) && !"9876543210987".includes(p);

function CampoPin({ id, valor, mudar, rotulo, auto }: { id: string; valor: string; mudar: (v: string) => void; rotulo: string; auto?: boolean }) {
  return <label className="campo" htmlFor={id}><span>{rotulo}</span>
    <input id={id} className="kaya-pin" type="password" inputMode="numeric" autoComplete="off" autoFocus={auto} maxLength={12} value={valor} onChange={(e) => mudar(e.target.value.replace(/\D/g, ""))} /></label>;
}

/** Criar o cofre (PIN + código de recuperação), desbloquear com PIN ou recuperar com o código. */
export function Cofre({ aoCriar }: { aoCriar?: () => void }) {
  const k = useKaya();
  const [pin, setPin] = useState(""), [pin2, setPin2] = useState(""), [codigo, setCodigo] = useState("");
  const [soLocal, setSoLocal] = useState(false);
  const [gerado, setGerado] = useState(""), [guardou, setGuardou] = useState(false);
  const [modoRec, setModoRec] = useState(false);
  const [erro, setErro] = useState(""), [trab, setTrab] = useState(false);
  const rodar = async (fn: () => Promise<unknown>) => { setErro(""); setTrab(true); try { await fn(); } catch (e) { setErro(String((e as Error).message)); } finally { setTrab(false); } };

  if (gerado) return (
    <div className="card">
      <h2><KeyRound size={18} /> Seu código de recuperação</h2>
      <p>Ele é a <b>única</b> forma de abrir seus dados se você esquecer o PIN ou trocar de aparelho. Aparece só agora. Nem nós conseguimos recuperar.</p>
      <div className="kaya-codigo">{gerado}</div>
      <div className="linha-botoes"><button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(gerado)}>Copiar</button></div>
      <label className="linha-toggle"><span><b>Guardei em lugar seguro</b><small>Ex.: gerenciador de senhas ou papel guardado.</small></span><input type="checkbox" className="interruptor" checked={guardou} onChange={(e) => setGuardou(e.target.checked)} /></label>
      <button type="button" className="btn pri grande" disabled={!guardou} onClick={() => { setGerado(""); aoCriar?.(); }}>Continuar</button>
    </div>
  );

  if (k.cofre === "novo") return (
    <div className="card">
      <h2><ShieldCheck size={18} /> Proteja seu {NOME}</h2>
      <p className="muted">Tudo é cifrado neste aparelho antes de ser salvo. Crie um PIN de 6 a 12 números (evite datas e sequências).</p>
      <CampoPin id="k-pin" valor={pin} mudar={setPin} rotulo="PIN" auto />
      <CampoPin id="k-pin2" valor={pin2} mudar={setPin2} rotulo="Repita o PIN" />
      <label className="linha-toggle"><span><b>Só neste aparelho</b><small>Nada sobe para a nuvem, nem cifrado. Se perder o aparelho, perde os dados.</small></span><input type="checkbox" className="interruptor" checked={soLocal} onChange={(e) => setSoLocal(e.target.checked)} /></label>
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      <button type="button" className="btn pri grande" disabled={trab} onClick={() => rodar(async () => {
        if (!pinValido(pin)) throw new Error("Use de 6 a 12 números, sem sequências nem números repetidos.");
        if (pin !== pin2) throw new Error("Os dois PINs não são iguais.");
        setGerado(await criarCofre(pin, soLocal));
      })}>{trab ? "Criando o cofre…" : "Criar cofre"}</button>
    </div>
  );

  if (k.cofre === "recuperar" || modoRec) return (
    <div className="card">
      <h2><KeyRound size={18} /> {k.cofre === "recuperar" ? "Abrir neste aparelho" : "Esqueci o PIN"}</h2>
      <p className="muted">Digite o código de recuperação que apareceu quando você criou o cofre e escolha um PIN novo para este aparelho.</p>
      <label className="campo"><span>Código de recuperação</span><input value={codigo} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCodigo(e.target.value)} placeholder="XXXX-XXXX-…" /></label>
      <CampoPin id="k-npin" valor={pin} mudar={setPin} rotulo="PIN novo" />
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      <button type="button" className="btn pri grande" disabled={trab} onClick={() => rodar(async () => { if (!pinValido(pin)) throw new Error("PIN: 6 a 12 números, sem sequências."); await recuperar(codigo, pin); })}>{trab ? "Abrindo…" : "Abrir"}</button>
      {modoRec && <button type="button" className="btn fantasma" onClick={() => setModoRec(false)}>Voltar</button>}
    </div>
  );

  return (
    <div className="card">
      <h2><Lock size={18} /> {NOME} bloqueado</h2>
      <CampoPin id="k-dpin" valor={pin} mudar={setPin} rotulo="Seu PIN" auto />
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      <button type="button" className="btn pri grande" disabled={trab || pin.length < 6} onClick={() => rodar(() => desbloquear(pin).finally(() => setPin("")))}>{trab ? "Abrindo…" : "Abrir"}</button>
      <button type="button" className="btn fantasma" onClick={() => { setModoRec(true); setPin(""); }}>Esqueci o PIN</button>
    </div>
  );
}
