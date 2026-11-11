import { useState } from "react";
import { ChevronLeft, HeartHandshake } from "lucide-react";
import { ID_PERFIL, salvar, useKaya } from "./dados";
import { Cofre } from "./Cofre";
import { Chips, ChipsMulti, lerReais, reais } from "./pecas";
import { APOIO, DISCLAIMER, NOME, OP, PRINCIPIO, REGRAS_SUGERIDAS, ROTULO_PERFIL, calcularPerfilUso, mostrarApoio, rotulo } from "./textos";
import type { Perfil, Regra } from "./tipos";

/** Primeira entrada: 8 telas curtas. Só idade e consentimento são obrigatórios; o resto dá para pular e editar depois. */
export function Onboarding({ aoTerminar }: { aoTerminar?: () => void }) {
  const k = useKaya();
  const [i, setI] = useState(0);
  const [maior18, setMaior18] = useState(false);
  const [consent, setConsent] = useState({ saude: false, ia: false, lembretes: false });
  const [p, setP] = useState({ apelido: "", termo: "kaya", termoOutro: "", propositos: [] as string[], norte: "", relacao: "", tempo: "", frequencia: "", formas: [] as string[], saude: [] as string[], acompanhamento: "", sentimento: "", arrependimentos: [] as string[], orcamento: "" });
  const [regras, setRegras] = useState<string[]>(REGRAS_SUGERIDAS);
  const [criandoCofre, setCriandoCofre] = useState(false);
  const [erro, setErro] = useState("");
  const set = (x: Partial<typeof p>) => setP((v) => ({ ...v, ...x }));
  const t = (p.termo === "outro" ? p.termoOutro : p.termo).trim().toLowerCase() || "kaya";
  const total = 8;
  const perfilUso = calcularPerfilUso({ relacao: p.relacao, saude: p.saude, sentimento: p.sentimento, propositos: p.propositos });

  async function concluir() {
    setErro("");
    try {
      const agora = new Date().toISOString();
      const perfil: Perfil = {
        tipo: "perfil", apelido: p.apelido.trim(), termo: t, propositos: p.propositos, norte: p.norte.trim(), relacao: p.relacao, tempo: p.tempo,
        frequencia: p.frequencia, formas: p.formas, saude: p.saude, acompanhamento: p.acompanhamento, sentimento: p.sentimento,
        arrependimentos: p.arrependimentos, orcamento: lerReais(p.orcamento), perfilUso, consent: { ...consent, maior18: true, em: agora }, criadoEm: agora,
      };
      await salvar(perfil, ID_PERFIL);
      for (const r of regras.filter((x) => x.trim())) await salvar<Regra>({ tipo: "regra", texto: r.trim(), ativa: true, criadoEm: agora, historico: {} });
      aoTerminar?.();
    } catch (e) { setErro(String((e as Error).message)); }
  }

  if (criandoCofre) return <Cofre aoCriar={() => void concluir()} />;

  const pode = i !== 1 || (maior18 && consent.saude);
  const avancar = () => { if (i < total - 1) setI(i + 1); else if (k.cofre === "aberto") void concluir(); else setCriandoCofre(true); };

  const telas = [
    <>
      <h1>Bem-vindo(a) ao {NOME}</h1>
      <p>Um espaço calmo para <b>registrar e entender</b> a sua relação com a planta, no seu ritmo.</p>
      <p><b>O que ele não é:</b> não vende, não indica produtos nem doses, não julga e não prescreve. {PRINCIPIO}</p>
      <p className="muted">Seus dados são cifrados neste aparelho antes de serem salvos. Só você consegue abrir.</p>
    </>,
    <>
      <h1>Antes de começar</h1>
      <label className="linha-toggle"><span><b>Tenho 18 anos ou mais</b><small>Obrigatório.</small></span><input type="checkbox" className="interruptor" checked={maior18} onChange={(e) => setMaior18(e.target.checked)} /></label>
      <label className="linha-toggle"><span><b>Autorizo tratar meus dados de saúde</b><small>Obrigatório para registrar. Ficam cifrados e só você vê (LGPD, art. 11).</small></span><input type="checkbox" className="interruptor" checked={consent.saude} onChange={(e) => setConsent({ ...consent, saude: e.target.checked })} /></label>
      <label className="linha-toggle"><span><b>Insights com IA</b><small>Opcional. Nesta versão não há IA: os insights são calculados no aparelho.</small></span><input type="checkbox" className="interruptor" checked={consent.ia} onChange={(e) => setConsent({ ...consent, ia: e.target.checked })} /></label>
      <label className="linha-toggle"><span><b>Lembretes</b><small>Opcional. Sempre neutros, sem citar o módulo nem a planta.</small></span><input type="checkbox" className="interruptor" checked={consent.lembretes} onChange={(e) => setConsent({ ...consent, lembretes: e.target.checked })} /></label>
    </>,
    <>
      <h1>Como você quer ser chamado(a) aqui?</h1>
      <input value={p.apelido} maxLength={30} placeholder="Um apelido basta" onChange={(e) => set({ apelido: e.target.value })} aria-label="Apelido" />
      <h2>Como você prefere chamar a planta?</h2>
      <Chips rotulo="Termo" ops={[...OP.termos, ["outro", "outro"]]} valor={p.termo} mudar={(v) => set({ termo: v || "kaya" })} />
      {p.termo === "outro" && <input value={p.termoOutro} maxLength={20} placeholder="Como você chama" onChange={(e) => set({ termoOutro: e.target.value })} aria-label="Outro termo" />}
    </>,
    <>
      <h1>O que te traz ao {NOME}?</h1>
      <ChipsMulti rotulo="Propósitos" ops={OP.propositos} valor={p.propositos} mudar={(v) => set({ propositos: v })} />
      <label className="campo"><span>Em uma frase, qual é a sua intenção? (opcional)</span><textarea rows={2} maxLength={140} value={p.norte} onChange={(e) => set({ norte: e.target.value })} placeholder="Ex.: usar com intenção, não por hábito." /></label>
    </>,
    <>
      <h1>Sua relação com a {t}</h1>
      <div className="campo"><span>Como você descreve hoje?</span><Chips rotulo="Relação" ops={OP.relacao} valor={p.relacao} mudar={(v) => set({ relacao: v })} /></div>
      <div className="campo"><span>Há quanto tempo?</span><Chips rotulo="Tempo" ops={OP.tempo} valor={p.tempo} mudar={(v) => set({ tempo: v })} /></div>
      <div className="campo"><span>Com que frequência hoje?</span><Chips rotulo="Frequência" ops={OP.frequencia} valor={p.frequencia} mudar={(v) => set({ frequencia: v })} /></div>
      <div className="campo"><span>Formas que costuma usar</span><ChipsMulti rotulo="Formas" ops={OP.formas} valor={p.formas} mudar={(v) => set({ formas: v })} /></div>
      <div className="campo"><span>Usa com alguma finalidade de saúde?</span><ChipsMulti rotulo="Saúde" ops={OP.saude} valor={p.saude} mudar={(v) => set({ saude: v })} /></div>
      {p.saude.length > 0 && <div className="campo"><span>Você tem acompanhamento médico?</span><Chips rotulo="Acompanhamento" ops={OP.acompanhamento} valor={p.acompanhamento} mudar={(v) => set({ acompanhamento: v })} /></div>}
    </>,
    <>
      <h1>Como está o uso hoje?</h1>
      <Chips rotulo="Sentimento" ops={OP.sentimento} valor={p.sentimento} mudar={(v) => set({ sentimento: v })} />
      <div className="campo"><span>Em algum destes contextos você já usou e se arrependeu? (opcional)</span><ChipsMulti rotulo="Contextos" ops={OP.arrependimentos} valor={p.arrependimentos} mudar={(v) => set({ arrependimentos: v })} /></div>
      {mostrarApoio(p) && (
        <div className="aviso dica"><HeartHandshake /><div>Obrigado por responder com sinceridade. Se em algum momento quiser conversar com alguém, existe apoio gratuito:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{APOIO.slice(0, 2).map((a) => <li key={a.nome}><b>{a.nome}</b>: {a.detalhe}</li>)}</ul></div></div>
      )}
    </>,
    <>
      <h1>Orçamento e regras pessoais</h1>
      <label className="campo"><span>Orçamento mensal (opcional)</span><input inputMode="decimal" value={p.orcamento} placeholder="R$ 0,00" onChange={(e) => set({ orcamento: e.target.value })} /></label>
      <div className="campo"><span>Suas primeiras regras (edite, apague ou mantenha)</span>
        {regras.map((r, n) => (
          <div key={n} className="busca"><input value={r} maxLength={80} aria-label={`Regra ${n + 1}`} onChange={(e) => setRegras(regras.map((x, j) => (j === n ? e.target.value : x)))} />
            <button type="button" className="btn fantasma" onClick={() => setRegras(regras.filter((_, j) => j !== n))}>Tirar</button></div>
        ))}
        {regras.length < 6 && <button type="button" className="btn" onClick={() => setRegras([...regras, ""])}>Adicionar regra</button>}
      </div>
    </>,
    <>
      <h1>Seu Cartão de Intenção</h1>
      <div className="kaya-intencao">
        <small>{p.apelido || "Você"} · {t}</small>
        <div className="norte">{p.norte || "Registrar com honestidade e escolher com calma."}</div>
        <small>{p.propositos.map((x) => rotulo(OP.propositos, x)).join(" · ") || "Entender meu uso"}</small>
        <small>Relação: {rotulo(OP.relacao, p.relacao) || "ainda definindo"} · Perfil: {ROTULO_PERFIL[perfilUso]}</small>
        {regras.filter((r) => r.trim()).length > 0 && <small>Regras: {regras.filter((r) => r.trim()).join(" · ")}</small>}
        {lerReais(p.orcamento) && <small>Orçamento: {reais(lerReais(p.orcamento)!)} por mês</small>}
      </div>
      <p className="muted" style={{ fontSize: ".85rem" }}>Tudo isso pode ser mudado depois em Mais › Meu perfil.</p>
    </>,
  ];

  return (
    <div className="kaya-conteudo">
      <div className="kaya-passos">
        <div className="kaya-topo">
          {i > 0 ? <button type="button" className="btn fantasma" onClick={() => setI(i - 1)}><ChevronLeft />Voltar</button> : <span />}
          <span className="muted" style={{ fontSize: ".8rem" }}>{i + 1} de {total}</span>
          {i >= 2 && i < total - 1 ? <button type="button" className="btn fantasma" onClick={() => setI(i + 1)}>Pular</button> : <span />}
        </div>
        <div className="kaya-barra"><span style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
      </div>
      <div className="card" style={{ gap: 14 }}>{telas[i]}</div>
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      <button type="button" className="btn pri grande" disabled={!pode} onClick={avancar}>{i === total - 1 ? `Começar meu ${t}` : i === 0 ? "Começar" : "Continuar"}</button>
      {i === 1 && !pode && <span className="muted" style={{ fontSize: ".8rem", textAlign: "center" }}>Para continuar, confirme a idade e o tratamento dos dados de saúde.</span>}
      <p className="kaya-disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
