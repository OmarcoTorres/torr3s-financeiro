import { useState } from "react";
import { LogOut } from "lucide-react";
import { sairDaConta } from "../lib/sync";
import { exportarBackup } from "../lib/backup";
import { BotaoConfirmar } from "./ui";

/**
 * Sair da conta sem perder nada: se ainda há mudanças que não subiram para a nuvem,
 * não sai e pergunta o que fazer (tentar enviar de novo, baixar backup e sair, ou ficar).
 */
export function BotaoSair({ className = "btn perigo", simples = false }: { className?: string; simples?: boolean }) {
  const [pendente, setPendente] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");

  const tentar = async (descartarPendentes = false) => {
    setTrabalhando(true); setErro("");
    try {
      const r = await sairDaConta({ descartarPendentes });
      setPendente(r.saiu ? null : r.texto);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    } finally { setTrabalhando(false); }
  };
  const backupESair = async () => {
    setTrabalhando(true); setErro("");
    try { await exportarBackup(); } catch (e) { setTrabalhando(false); setErro(`Não deu para gerar o backup (${String((e as Error)?.message ?? e)}). Nada foi apagado.`); return; }
    await tentar(true);
  };

  if (pendente) return (
    <div className="aviso warn" role="alertdialog" aria-label="Mudanças não enviadas">
      <div>
        <b>{pendente}.</b> Se sair agora, elas se perdem, porque sair apaga os dados deste aparelho.
        <div className="linha-botoes">
          <button type="button" className="btn pri" disabled={trabalhando} onClick={() => void tentar()}>{trabalhando ? "Enviando…" : "Tentar enviar de novo"}</button>
          <button type="button" className="btn" disabled={trabalhando} onClick={() => void backupESair()}>Baixar backup e sair</button>
          <button type="button" className="btn fantasma" disabled={trabalhando} onClick={() => setPendente(null)}>Cancelar</button>
        </div>
        {erro && <div className="neg" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
      </div>
    </div>
  );

  return (
    <>
      {simples
        ? <button type="button" className={className} disabled={trabalhando} onClick={() => void tentar()}>{trabalhando ? "Saindo…" : "Sair"}</button>
        : <BotaoConfirmar className={className} confirmar={trabalhando ? "Saindo…" : "Toque de novo para sair"} onConfirm={() => void tentar()}><LogOut />Sair da conta</BotaoConfirmar>}
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
    </>
  );
}
