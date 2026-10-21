export type WaterStatus = 'sem-agua' | 'voltou';

export interface Report {
  id: string;
  lng: number;
  lat: number;
  bairro: string;
  status: WaterStatus;
  createdAt: number;
  /** Última vez que o mesmo aparelho confirmou o relato (renova o prazo no mapa). */
  confirmedAt?: number | null;
  /** Quando o relato foi encerrado: o aparelho que avisou mandou o status oposto. */
  closedAt?: number | null;
  demo?: boolean;
  /** Relato feito neste aparelho (guarda a posição exata, que nunca sai daqui). */
  mine?: boolean;
  /** Para relatos deste aparelho: se o servidor já recebeu. */
  synced?: boolean;
}

export interface Bairro {
  nome: string;
  lng: number;
  lat: number;
}

export interface MapCenter {
  lng: number;
  lat: number;
  bairro: string;
}

export interface MapPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FlyTo {
  lng: number;
  lat: number;
  zoom?: number;
}

/** Contrato de eventos entre os microfrontends. Chave = nome do evento, valor = payload. */
export interface BusEvents {
  /** Shell → todos: lista atualizada de relatos. */
  reports: Report[];
  /** Mapa → todos: centro do mapa (posição do pin) depois que o usuário para de arrastar. */
  center: MapCenter;
  /** Painel → shell: usuário relatou o status da água na posição do pin. */
  'report-submit': {
    status: WaterStatus;
    /** Responde "Ainda sem água?" sobre um relato deste aparelho: usa a posição dele, não a do pin. */
    reconfirmar?: string;
  };
  /** Shell/painel → mapa: mover o mapa para um ponto. */
  'fly-to': FlyTo;
  /** Shell → mapa: centralizar na localização do GPS (assine com { replay: false }). */
  locate: null;
  /** Mapa → shell: estilo e primeiros tiles carregados (o shell fecha a splash screen). */
  'map-ready': null;
  /** Painel → shell: altura da parte recolhida do bottom sheet. */
  'sheet-height': number;
  /** Shell → mapa: área do mapa coberta por elementos do layout (busca, painel). */
  'map-padding': MapPadding;
}

/** Função exposta por cada microfrontend remoto. Retorna a função de desmontagem. */
export type MountFn = (el: HTMLElement) => () => void;
