// Formatação pt-BR e utilidades do painel.

const TZ = 'America/Sao_Paulo';

export const nf = new Intl.NumberFormat('pt-BR');

/** 1.284 / 12,9 mil / 4,2 mi */
export function compacto(n: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function hojeEmSalto(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function somaDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-21" → "21/10/2026"; curto → "21/10". */
export function dataBr(iso: string, curto = false): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return curto ? `${d}/${m}` : `${d}/${m}/${a}`;
}

export function horaBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function dataHoraBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Variação percentual vs período anterior; null quando não há base. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** Escapa texto vindo da API antes de pôr em HTML de tooltip. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
