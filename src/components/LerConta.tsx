import { useEffect, useState } from "react";
import { Camera, ImageUp, ScanText } from "lucide-react";
import { comprimirImagem, lerConta } from "../lib/ia";
import { hoje } from "../lib/calc";
import { Folha, type DadosApp } from "./ui";
import type { Rascunho } from "./LancamentoForm";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function LerConta({ aberta, fechar, dados, aoLer }: { aberta: boolean; fechar: () => void; dados: DadosApp; aoLer: (r: Rascunho, foto: Blob) => void }) {
  const [arquivo, setArquivo] = useState<Blob>();
  const [url, setUrl] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { if (!aberta) { setArquivo(undefined); setErro(""); setLendo(false); } }, [aberta]);
  useEffect(() => {
    if (!arquivo) { setUrl(""); return; }
    const u = URL.createObjectURL(arquivo); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  async function ler() {
    if (!arquivo) return;
    setLendo(true); setErro("");
    try {
      const { blob, base64 } = await comprimirImagem(arquivo);
      const r = await lerConta(base64, dados.cats.map((c) => c.nome));
      const cat = r.categoria ? dados.cats.find((c) => norm(c.nome) === norm(r.categoria!)) : undefined;
      const venc = r.vencimento;
      const obs = [r.beneficiario && `Beneficiário: ${r.beneficiario}`, r.linhaDigitavel && `Linha digitável: ${r.linhaDigitavel}`].filter(Boolean).join("\n");
      aoLer({
        tipo: r.tipo,
        descricao: r.descricao || r.beneficiario || "Conta",
        valor: r.valor ? Math.round(r.valor * 100) : undefined,
        data: venc && venc < hoje() ? venc : hoje(),
        vencimento: venc,
        status: "pendente",
        categoriaId: cat?.tipo === r.tipo ? cat.id : undefined,
        observacao: obs || undefined,
      }, blob);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }

  return (
    <Folha titulo="Ler conta pela foto" aberta={aberta} fechar={fechar}>
      <p className="muted" style={{ margin: 0 }}>Fotografe um boleto, fatura, nota ou recibo, de frente e com boa luz. Valor, vencimento e categoria vêm preenchidos; você confere antes de salvar.</p>
      {url ? <img src={url} alt="Foto da conta" className="foto-previa" /> : (
        <div className="vazio card"><ScanText /><div>Nenhuma foto escolhida.</div></div>
      )}
      <div className="linha-botoes">
        <label className="btn pri"><Camera />Tirar foto
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && setArquivo(e.target.files[0])} />
        </label>
        <label className="btn"><ImageUp />Escolher imagem
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setArquivo(e.target.files[0])} />
        </label>
      </div>
      {erro && <div className="aviso neg" role="alert">{erro}</div>}
      <button type="button" className="btn pri" disabled={!arquivo || lendo} onClick={ler}>
        {lendo ? <><span className="carregando" aria-hidden />Lendo a conta…</> : "Ler e preencher"}
      </button>
    </Folha>
  );
}
