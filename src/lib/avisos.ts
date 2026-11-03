import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** Avisos que o robô enviou (vencimentos, faturas, metas, bom dia), guardados na conta. */
export interface AvisoHist { id: number; titulo: string; corpo: string; url?: string | null; tag?: string | null; criado_em: string; lido_em?: string | null }

export async function carregarAvisos(limite = 60): Promise<AvisoHist[]> {
  const { data, error } = await supabase.from("avisos_historico").select("id,titulo,corpo,url,tag,criado_em,lido_em").order("criado_em", { ascending: false }).limit(limite);
  if (error) return [];
  return (data ?? []) as AvisoHist[];
}

export async function marcarLidos(ids: number[]) {
  if (!ids.length) return;
  await supabase.from("avisos_historico").update({ lido_em: new Date().toISOString() }).in("id", ids);
  window.dispatchEvent(new Event("avisos-lidos"));
}

/** Quantos avisos ainda não foram vistos (para o contador no ícone do assistente). */
export function useAvisosNaoLidos() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    const contar = async () => {
      const { count, error } = await supabase.from("avisos_historico").select("id", { count: "exact", head: true }).is("lido_em", null);
      if (vivo && !error) setN(count ?? 0);
    };
    void contar();
    const t = setInterval(contar, 60_000);
    const vis = () => { if (document.visibilityState === "visible") void contar(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("avisos-lidos", contar);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("avisos-lidos", contar); };
  }, []);
  return n;
}
