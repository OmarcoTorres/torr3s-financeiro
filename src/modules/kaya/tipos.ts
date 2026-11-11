/** Kaya Life — tudo isto é cifrado no aparelho antes de ser guardado (ver cripto.ts). */
export type Termo = "kaya" | "medicina" | "cannabis" | "erva" | string;
export type PerfilUso = "medicinal" | "recreativo" | "ritual" | "em_reavaliacao" | "misto";

export interface Perfil {
  tipo: "perfil";
  apelido: string;
  termo: Termo;
  propositos: string[];
  norte: string;
  relacao: string;
  tempo: string;
  frequencia: string;
  formas: string[];
  saude: string[];          // finalidades de saúde (vazio = nenhuma)
  acompanhamento: string;   // sim | nao | quero
  sentimento: string;
  arrependimentos: string[];
  orcamento?: number;       // centavos por mês
  perfilUso: PerfilUso;
  consent: { saude: boolean; ia: boolean; lembretes: boolean; maior18: true; em: string };
  criadoEm: string;
}
export interface Checkin { porque: string; como: string; espera: string; esperou10: boolean }
export interface Registro {
  tipo: "registro"; quando: string; forma: string; quantidade: "pouco" | "moderado" | "muito";
  contexto: string[]; humorAntes: number; humorDepois?: number; custo?: number; checkin?: Checkin; escolha: "intencional" | "automatico"; nota?: string;
}
export interface Pausa { tipo: "pausa"; quando: string; modo: "respiracao" | "onda" | "timer"; segundos: number; seguiuSemUsar?: boolean }
export interface Diario { tipo: "diario"; quando: string; texto: string; emocoes: string[]; pergunta?: string }
export interface Sintoma { tipo: "sintoma"; quando: string; dor?: number; sono?: number; ansiedade?: number; apetite?: number; colaterais?: string }
export interface Gasto { tipo: "gasto"; quando: string; valor: number; nota?: string }
export interface Regra { tipo: "regra"; texto: string; ativa: boolean; criadoEm: string; historico: Record<string, boolean> }

export type Item = Perfil | Registro | Pausa | Diario | Sintoma | Gasto | Regra;
export type ComId<T> = T & { id: string };
