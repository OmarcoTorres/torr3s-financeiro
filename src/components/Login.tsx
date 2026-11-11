import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Mail, Users } from "lucide-react";
import { erroAuth, supabase } from "../lib/supabase";
import { convitePendente } from "../lib/sync";

type Modo = "entrar" | "criar" | "recuperar" | "nova-senha";

export function Login({ modoInicial = "entrar", aoDefinirSenha, marca = "Invest+", icone = "/icon.svg" }: { modoInicial?: Modo; aoDefinirSenha?: () => void; marca?: string; icone?: string }) {
  const pendente = convitePendente();
  const [modo, setModo] = useState<Modo>(pendente && modoInicial === "entrar" ? "criar" : modoInicial);
  const [quemConvidou, setQuemConvidou] = useState<string | null>(null);
  useEffect(() => {
    if (!pendente) return;
    supabase.rpc("ver_convite", { p_codigo: pendente }).then(({ data }) => {
      const r = (data as { nome: string; valido: boolean }[] | null)?.[0];
      if (r?.valido) setQuemConvidou(r.nome.split(" ")[0]);
    });
  }, [pendente]);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [ver, setVer] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setOk("");
    if (modo !== "nova-senha" && !/^\S+@\S+\.\S+$/.test(email.trim())) return setErro("Digite um e-mail válido.");
    if ((modo === "criar" || modo === "nova-senha") && senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if ((modo === "criar" || modo === "nova-senha") && senha !== senha2) return setErro("As duas senhas não são iguais.");
    setCarregando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else if (modo === "criar") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) { setOk("Conta criada. Enviamos um link de confirmação para o seu e-mail: abra-o e depois entre aqui."); setModo("entrar"); setSenha(""); setSenha2(""); }
      } else if (modo === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin });
        if (error) throw error;
        setOk("Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.");
      } else {
        const { error } = await supabase.auth.updateUser({ password: senha });
        if (error) throw error;
        setOk("Senha alterada.");
        aoDefinirSenha?.();
      }
    } catch (er) {
      setErro(erroAuth(er));
    } finally {
      setCarregando(false);
    }
  }

  const titulo = { entrar: `Entrar no ${marca}`, criar: "Criar sua conta", recuperar: "Recuperar a senha", "nova-senha": "Definir nova senha" }[modo];
  const sub = {
    entrar: "Seus dados ficam salvos na sua conta e aparecem em qualquer aparelho.",
    criar: "Leva um minuto. Depois a gente monta o painel do seu jeito.",
    recuperar: "Enviamos um link para o seu e-mail para você criar uma senha nova.",
    "nova-senha": "Escolha uma senha nova para a sua conta.",
  }[modo];

  return (
    <div className="boasvindas">
      <div className="topo-bv"><img src={icone} alt="" /><b>{marca}</b></div>
      <form className="corpo" onSubmit={enviar} noValidate>
        {quemConvidou && modo !== "nova-senha" && (
          <div className="aviso dica"><Users size={18} /><div><b>{quemConvidou} convidou você para o grupo dele no {marca}.</b> Crie sua conta (ou entre, se já tiver) e vocês ficam conectados automaticamente.</div></div>
        )}
        <h1>{titulo}</h1>
        <p className="lead">{sub}</p>
        <div className="card" style={{ gap: 12 }}>
          {modo !== "nova-senha" && (
            <div className="campo">
              <label htmlFor="lg-email"><span className="muted" style={{ fontSize: ".8rem", fontWeight: 600 }}>E-mail</span></label>
              <div className="campo-senha">
                <Mail size={18} className="muted icone-campo" aria-hidden />
                <input id="lg-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              </div>
            </div>
          )}
          {modo !== "recuperar" && (
            <div className="campo">
              <label htmlFor="lg-senha"><span className="muted" style={{ fontSize: ".8rem", fontWeight: 600 }}>{modo === "nova-senha" ? "Nova senha" : "Senha"}</span></label>
              <div className="campo-senha">
                <Lock size={18} className="muted icone-campo" aria-hidden />
                {/* key força um campo novo ao alternar: o Safari ignora a troca de tipo em campo preenchido pelo Chaves. */}
                <input key={ver ? "t" : "p"} id="lg-senha" type={ver ? "text" : "password"} autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={modo === "entrar" ? "Sua senha" : "Mínimo de 8 caracteres"} />
                <button type="button" className="olho" onPointerDown={(e) => e.preventDefault()} onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder senha" : "Mostrar senha"} aria-pressed={ver}>
                  {ver ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>
          )}
          {(modo === "criar" || modo === "nova-senha") && (
            <div className="campo">
              <label htmlFor="lg-senha2"><span className="muted" style={{ fontSize: ".8rem", fontWeight: 600 }}>Repita a senha</span></label>
              <div className="campo-senha">
                <Lock size={18} className="muted icone-campo" aria-hidden />
                <input key={ver ? "t2" : "p2"} id="lg-senha2" type={ver ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={senha2} onChange={(e) => setSenha2(e.target.value)} />
              </div>
            </div>
          )}
          {erro && <div className="aviso neg" role="alert">{erro}</div>}
          {ok && <div className="aviso dica" role="status">{ok}</div>}
          <button type="submit" className="btn pri grande" disabled={carregando}>
            {carregando ? <span className="carregando" aria-label="Aguarde" /> : { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link", "nova-senha": "Salvar nova senha" }[modo]}
          </button>
          {modo === "entrar" && <button type="button" className="btn fantasma" onClick={() => { setModo("recuperar"); setErro(""); setOk(""); }}>Esqueci minha senha</button>}
        </div>
        {modo !== "nova-senha" && (
          <p className="muted" style={{ textAlign: "center" }}>
            {modo === "entrar" ? "Ainda não tem conta? " : "Já tem conta? "}
            <button type="button" className="btn fantasma" style={{ padding: "0 4px", minHeight: 0, display: "inline" }} onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setErro(""); setOk(""); }}>
              {modo === "entrar" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        )}
      </form>
      <div />
    </div>
  );
}
