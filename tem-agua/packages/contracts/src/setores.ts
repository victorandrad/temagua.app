import lista from './abastecimento-setores.json';

/** Setor de abastecimento sem os polígonos (gerado junto com abastecimento.json pelo importador). */
export interface SetorResumo {
  id: string;
  nome: string;
  /** Mesma cor do mapa. */
  cor: string;
  areas: number;
  reservatorios: number;
}

/** Lista leve dos setores, para menus e legendas (o shell usa sem carregar os polígonos). */
export const SETORES_RESUMO = lista as SetorResumo[];
