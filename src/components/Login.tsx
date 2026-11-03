import { useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { erroAuth, supabase } from "../lib/supabase";

type Modo = "entrar" | "criar" | "recuperar" | "nova-senha";

export function Login({ modoInicial = "entrar", aoDefinirSenha }: { modoInicial?: Modo; aoDefinirSenha?: () => void }) {
  const [modo, setModo] = useState<Modo>(modoInicial);
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

  const titulo = { entrar: "Entrar no Invest+", criar: "Criar sua conta", recuperar: "Recuperar a senha", "nova-senha": "Definir nova senha" }[modo];
  const sub = {
    entrar: "Seus dados ficam salvos na sua conta e aparecem em qualquer aparelho.",
    criar: "Leva um minuto. Depois a gente monta o painel do seu jeito.",
    recuperar: "Enviamos um link para o seu e-mail para você criar uma senha nova.",
    "nova-senha": "Escolha uma senha nova para a sua conta.",
  }[modo];

  return (
    <div className="boasvindas">
      <div className="topo-bv"><img src="/icon.svg" alt="" /><b>Invest+</b></div>
      <form className="corpo" onSubmit={enviar} noValidate>
        <h1>{titulo}</h1>
        <p className="lead">{sub}</p>
        <div className="card" style={{ gap: 12 }}>
          {modo !== "nova-senha" && (
            <label className="campo"><span>E-mail</span>
              <div style={{ position: "relative" }}>
                <Mail size={18} className="muted" style={{ position: "absolute", left: 14, top: 15 }} aria-hidden />
                <input id="lg-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ paddingLeft: 42, width: "100%" }} placeholder="voce@email.com" />
              </div>
            </label>
          )}
          {modo !== "recuperar" && (
            <label className="campo"><span>{modo === "nova-senha" ? "Nova senha" : "Senha"}</span>
              <div style={{ position: "relative" }}>
                <Lock size={18} className="muted" style={{ position: "absolute", left: 14, top: 15 }} aria-hidden />
                <input id="lg-senha" type={ver ? "text" : "password"} autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} style={{ paddingLeft: 42, paddingRight: 46, width: "100%" }} placeholder={modo === "entrar" ? "Sua senha" : "Mínimo de 8 caracteres"} />
                <button type="button" className="btn fantasma" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder senha" : "Mostrar senha"} style={{ position: "absolute", right: 2, top: 2, minHeight: 44, padding: "0 12px", color: "var(--muted)" }}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
          )}
          {(modo === "criar" || modo === "nova-senha") && (
            <label className="campo"><span>Repita a senha</span><input id="lg-senha2" type={ver ? "text" : "password"} autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} /></label>
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
