import type { Tabela } from "./relatorio";

function baixar(nome: string, conteudo: Blob) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const nomeArquivo = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase();

/** CSV com ponto e vírgula e BOM, para abrir certo no Excel em português. */
export function exportarCSV(titulo: string, t: Tabela) {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const linhas = [t.cabecalho, ...t.linhas, ...(t.total ? [t.total] : [])].map((l) => l.map(esc).join(";"));
  baixar(`${nomeArquivo(titulo)}.csv`, new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }));
}

export async function exportarPDF(titulo: string, subtitulo: string, empresa: string, t: Tabela) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: t.cabecalho.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(15); doc.text(titulo, 14, 16);
  doc.setFontSize(9); doc.setTextColor(110); doc.text(`${empresa} · ${subtitulo}`, 14, 22);
  autoTable(doc, {
    startY: 27,
    head: [t.cabecalho],
    body: t.linhas,
    foot: t.total ? [t.total] : undefined,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [15, 61, 46] },
    footStyles: { fillColor: [232, 238, 233], textColor: [20, 30, 25], fontStyle: "bold" },
    columnStyles: Object.fromEntries(t.numericas.map((i) => [i, { halign: "right" as const }])),
  });
  doc.save(`${nomeArquivo(titulo)}.pdf`);
}

export { baixar };
