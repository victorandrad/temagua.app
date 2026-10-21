import type { Report } from './types';

// ---- Quanto tempo um relato vale ----
// Salto tem rodízio de 24 h com água e 24 h sem: um relato de 24 h atrás descreve o dia anterior.
// Por isso o relato fica 12 h no mapa, contadas da última confirmação, e perde peso no caminho.

const HORA_MS = 60 * 60 * 1000;

/** Tempo de vida no mapa depois da última confirmação. Manter igual a DURACAO_HORAS em apps/api/db.mjs. */
export const DURACAO_MS = 12 * HORA_MS;
/** A cada 3 h o peso do relato no mapa de calor cai pela metade. */
export const MEIA_VIDA_MS = 3 * HORA_MS;
/** Depois de 4 h o app pergunta a quem avisou "Ainda sem água?" (a resposta renova o relato). */
export const RECONFIRMAR_MS = 4 * HORA_MS;

/** Último momento em que o relato foi feito ou confirmado. */
export const ultimaConfirmacao = (r: Report): number => r.confirmedAt ?? r.createdAt;

/** Relato que ainda vale no mapa: não foi encerrado (a água voltou para quem avisou) nem expirou. */
export function relatoAtivo(r: Report, agora = Date.now()): boolean {
  return !r.closedAt && agora - ultimaConfirmacao(r) < DURACAO_MS;
}

/** Peso de 1 (agora) caindo pela metade a cada MEIA_VIDA_MS. */
export function frescor(r: Report, agora = Date.now()): number {
  return 0.5 ** (Math.max(0, agora - ultimaConfirmacao(r)) / MEIA_VIDA_MS);
}

// ---- Identificador do aparelho ----
// UUID aleatório criado na primeira visita (o navegador não dá acesso a IMEI/ID de hardware).
// Serve para o servidor manter um relato ativo por aparelho: o mesmo aparelho renova o próprio
// relato em vez de somar outro, e "a água voltou" encerra a falta que ele avisou. Vai só no
// cabeçalho do POST; a API guarda um hash (HMAC) e nunca o devolve.

const CHAVE_APARELHO = 'tem-agua:aparelho:v1';
export const CABECALHO_APARELHO = 'X-Aparelho';
let aparelho: string | undefined;

export function idDoAparelho(): string {
  if (aparelho) return aparelho;
  try {
    aparelho = localStorage.getItem(CHAVE_APARELHO) ?? undefined;
    if (!aparelho) {
      aparelho = crypto.randomUUID();
      localStorage.setItem(CHAVE_APARELHO, aparelho);
    }
  } catch {
    // Armazenamento bloqueado (navegação privada): vale só enquanto a página estiver aberta.
    aparelho ??= crypto.randomUUID();
  }
  return aparelho;
}
