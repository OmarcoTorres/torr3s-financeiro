import { db, type Meta } from "../db";
import { hoje } from "./calc";
import { guardarNaMetaDoGrupo, removerAporteDoGrupo, type MetaGrupo } from "./grupos";
import { supabase } from "./supabase";
import { celebrarDeposito, mensagemDeCarinho } from "../components/Coracoes";

/**
 * Um depósito numa meta, do jeito único do app: grava, comemora (com "Desfazer") e, se a meta é do grupo,
 * avisa as outras pessoas por push alguns segundos depois (se a pessoa desfizer antes, o aviso não sai).
 */
const ESPERA_AVISO_MS = 8000;

export async function depositarNaMeta(o: { minha?: Meta; doGrupo?: MetaGrupo; somaGrupo: number; valor: number; cor: string }) {
  const nome = o.minha?.nome ?? o.doGrupo!.nome;
  const alvo = o.minha?.alvo ?? o.doGrupo!.alvo;
  const antes = (o.minha?.guardado ?? o.doGrupo!.guardado) + o.somaGrupo;
  const grupoId = o.minha?.grupoId ?? o.doGrupo?.grupo_id;

  let desfazerGravacao: () => Promise<void>;
  if (o.minha) {
    const id = o.minha.id;
    const anterior = { guardado: o.minha.guardado, aportes: o.minha.aportes };
    await db.metas.update(id, { guardado: anterior.guardado + o.valor, aportes: [...anterior.aportes, { data: hoje(), valor: o.valor }] });
    desfazerGravacao = async () => { await db.metas.update(id, anterior); };
  } else {
    const aporteId = await guardarNaMetaDoGrupo(o.doGrupo!, o.valor);
    desfazerGravacao = () => removerAporteDoGrupo(aporteId);
  }

  let desfeito = false;
  const aviso = grupoId ? window.setTimeout(() => { if (!desfeito) void avisarGrupo(grupoId, nome, o.valor, alvo - antes - o.valor); }, ESPERA_AVISO_MS) : undefined;

  celebrarDeposito({
    valor: o.valor, metaNome: nome, antes, depois: antes + o.valor, alvo, cor: o.cor,
    mensagem: mensagemDeCarinho(o.valor, nome, alvo - antes - o.valor, !!grupoId),
    desfazer: async () => { desfeito = true; window.clearTimeout(aviso); await desfazerGravacao(); },
  });
}

/** Push para as outras pessoas do grupo ("Rita guardou R$ 200 para Viagem a dois"). Nunca trava nada. */
async function avisarGrupo(grupo: string, meta: string, valorCentavos: number, faltaCentavos: number) {
  try {
    const { data } = await supabase.auth.getSession();
    await fetch("/api/aviso-grupo", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ grupo, meta, valor: valorCentavos, falta: Math.max(0, faltaCentavos) }),
    });
  } catch { /* sem internet: o outro vê ao abrir o app */ }
}
