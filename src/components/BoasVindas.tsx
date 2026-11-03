import { useState } from "react";
import { ArrowLeft, BarChart3, Briefcase, CalendarClock, Compass, CreditCard, PiggyBank, Rocket, Search, ShieldCheck, Target, User, Users } from "lucide-react";
import { aplicarPerfil, type Objetivo, type Perfil, type Uso } from "../db";
import { lerValor } from "../lib/format";
import { OBJETIVOS } from "../lib/perfil";
import { InputDigitos, InputNome, InputValor } from "./campos";

const ICONE_OBJ: Record<Objetivo, typeof Compass> = { organizar: CalendarClock, gastos: Search, economizar: PiggyBank, dividas: ShieldCheck, crescer: Rocket };
const ETAPAS = 6;

/** Primeiro acesso: nome, idade, uso, objetivo e ponto de partida. Termina chamando o treinamento. */
export function BoasVindas({ aoTerminar, inicial }: { aoTerminar: (comTreino: boolean) => void; inicial?: Perfil }) {
  const [etapa, setEtapa] = useState(0);
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [idade, setIdade] = useState(inicial?.idade ? String(inicial.idade) : "");
  const [uso, setUso] = useState<Uso>(inicial?.uso ?? "pessoal");
  const [empresa, setEmpresa] = useState(inicial?.empresa ?? "");
  const [objetivo, setObjetivo] = useState<Objetivo>(inicial?.objetivo ?? "organizar");
  const [metaTxt, setMetaTxt] = useState("");
  const [saldoTxt, setSaldoTxt] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const primeiro = nome.trim().split(/\s+/)[0];
  const meta = OBJETIVOS[objetivo].meta;

  function avancar() {
    setErro("");
    if (etapa === 1 && nome.trim().length < 2) return setErro("Escreva como você quer ser chamado.");
    if (etapa === 2 && idade && !(Number(idade) >= 12 && Number(idade) <= 110)) return setErro("Confira a idade (entre 12 e 110).");
    if (etapa === 3 && uso === "empresa" && !empresa.trim()) return setErro("Qual o nome da empresa?");
    setEtapa((e) => Math.min(ETAPAS, e + 1));
  }

  async function concluir(comTreino: boolean) {
    setSalvando(true);
    const perfil: Perfil = {
      nome: nome.trim(), idade: idade ? Number(idade) : undefined, uso, empresa: uso === "empresa" ? empresa.trim() : undefined,
      objetivo, meta: meta ? lerValor(metaTxt) ?? undefined : undefined, criadoEm: inicial?.criadoEm ?? new Date().toISOString(),
    };
    await aplicarPerfil(perfil, { saldoInicial: lerValor(saldoTxt) ?? 0, tour: comTreino });
    aoTerminar(comTreino);
  }

  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); avancar(); } };

  return (
    <div className="boasvindas">
      <div className="topo-bv">
        {etapa > 0 && etapa < ETAPAS ? <button type="button" className="btn icone fantasma" aria-label="Voltar" onClick={() => setEtapa(etapa - 1)}><ArrowLeft /></button> : <img src="/icon.svg" alt="" />}
        <b>Invest+</b>
        {etapa > 0 && <div className="etapas" aria-label={`Etapa ${etapa} de ${ETAPAS}`}>{Array.from({ length: ETAPAS }, (_, i) => <i key={i} className={i < etapa ? "on" : ""} />)}</div>}
      </div>

      <div className="corpo">
        {etapa === 0 && (
          <>
            <span className="rotulo">Seu financeiro, simples</span>
            <h1>Todas as suas finanças em um só lugar.</h1>
            <p className="lead">Em dois minutos a gente monta o app do seu jeito: para você ou para a sua empresa, com o objetivo que importa agora.</p>
            <div className="vitrine">
              <div><BarChart3 /><b>Dashboard completo</b><span>Saldo, receitas, despesas e gastos por categoria.</span></div>
              <div><CreditCard /><b>Cartões de crédito</b><span>Faturas, limite e vencimento de cada cartão.</span></div>
              <div><Target /><b>Metas</b><span>Defina objetivos e acompanhe o progresso.</span></div>
            </div>
          </>
        )}

        {etapa === 1 && (
          <>
            <span className="rotulo">1 · Sobre você</span>
            <h1>Como você quer ser chamado?</h1>
            <InputNome className="campo-grande" id="bv-nome" autoFocus autoComplete="given-name" placeholder="Seu nome" value={nome} onChange={setNome} onKeyDown={enter} maxLength={60} />
          </>
        )}

        {etapa === 2 && (
          <>
            <span className="rotulo">2 · Sobre você</span>
            <h1>{primeiro}, qual a sua idade?</h1>
            <p className="lead">Usamos só para ajustar as dicas, como o tamanho da reserva de emergência. Pode pular.</p>
            <InputDigitos className="campo-grande" id="bv-idade" autoFocus max={3} placeholder="Idade" value={idade} onChange={setIdade} onKeyDown={enter} />
          </>
        )}

        {etapa === 3 && (
          <>
            <span className="rotulo">3 · Para quem</span>
            <h1>Você vai controlar o dinheiro de quem?</h1>
            <div className="opcoes" role="group" aria-label="Uso">
              <button type="button" className="opcao" aria-pressed={uso === "pessoal"} onClick={() => setUso("pessoal")}><span className="ic-op"><User /></span><span><b>O meu</b><small>Salário, contas da casa, cartão, metas pessoais.</small></span></button>
              <button type="button" className="opcao" aria-pressed={uso === "empresa"} onClick={() => setUso("empresa")}><span className="ic-op"><Briefcase /></span><span><b>O da minha empresa</b><small>Clientes, fornecedores, impostos, fluxo de caixa.</small></span></button>
            </div>
            {uso === "empresa" && (
              <label className="campo"><span>Nome da empresa</span><input id="bv-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} onKeyDown={enter} maxLength={60} placeholder="Ex.: TORR3S Consultoria" /></label>
            )}
          </>
        )}

        {etapa === 4 && (
          <>
            <span className="rotulo">4 · Objetivo</span>
            <h1>O que é mais importante agora?</h1>
            <div className="opcoes" role="group" aria-label="Objetivo">
              {(Object.keys(OBJETIVOS) as Objetivo[]).map((k) => {
                const I = ICONE_OBJ[k];
                return (
                  <button key={k} type="button" className="opcao" aria-pressed={objetivo === k} onClick={() => setObjetivo(k)}>
                    <span className="ic-op"><I /></span><span><b>{OBJETIVOS[k].titulo}</b><small>{OBJETIVOS[k].descricao[uso]}</small></span>
                  </button>
                );
              })}
            </div>
            {meta && (
              <label className="campo"><span>{meta.rotulo}</span><InputValor id="bv-meta" value={metaTxt} onChange={setMetaTxt} onKeyDown={enter} /><small className="muted">{meta.ajuda} Pode deixar em branco e definir depois.</small></label>
            )}
          </>
        )}

        {etapa === 5 && (
          <>
            <span className="rotulo">5 · Ponto de partida</span>
            <h1>Quanto tem hoje na {uso === "empresa" ? "conta da empresa" : "sua conta"}?</h1>
            <p className="lead">É o saldo inicial. Daqui para frente, cada lançamento atualiza esse valor. Você pode cadastrar outras contas depois.</p>
            <InputValor grande id="bv-saldo" autoFocus value={saldoTxt} onChange={setSaldoTxt} onKeyDown={enter} aria-label="Saldo atual" />
          </>
        )}

        {etapa === 6 && (
          <>
            <span className="rotulo">Tudo pronto</span>
            <h1>{primeiro}, seu Invest+ está pronto.</h1>
            <p className="lead">
              Categorias {uso === "empresa" ? "de empresa" : "pessoais"}, foco em <b>{OBJETIVOS[objetivo].foco.toLowerCase()}</b>
              {meta && lerValor(metaTxt) ? " e a sua meta do mês" : ""}. Agora um tour rápido de 1 minuto mostra onde fica cada coisa.
            </p>
            <div className="vitrine">
              <div><Compass /><b>Tour guiado</b><span>8 passos, dá para pular.</span></div>
              <div><Users /><b>Primeiros passos</b><span>Uma lista no início para você completar.</span></div>
              <div><ShieldCheck /><b>Seus dados</b><span>Salvos na sua conta, só você acessa.</span></div>
            </div>
          </>
        )}
        {erro && <div className="aviso neg" role="alert">{erro}</div>}
      </div>

      <div className="rodape">
        {etapa < ETAPAS ? (
          <>
            {etapa === 2 && <button type="button" className="btn grande fantasma" onClick={() => { setIdade(""); setEtapa(3); }}>Pular</button>}
            <button type="button" className="btn pri grande" onClick={avancar}>{etapa === 0 ? "Começar" : "Continuar"}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn grande" disabled={salvando} onClick={() => concluir(false)}>Pular tour</button>
            <button type="button" className="btn pri grande" disabled={salvando} onClick={() => concluir(true)}>{salvando ? "Montando…" : "Fazer o tour"}</button>
          </>
        )}
      </div>
    </div>
  );
}
