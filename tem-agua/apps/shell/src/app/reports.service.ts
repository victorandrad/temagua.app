import { computed, effect, Injectable, signal } from '@angular/core';
import {
  BAIRROS,
  CABECALHO_APARELHO,
  coarsen,
  emit,
  idDoAparelho,
  last,
  on,
  relatoAtivo,
  toPublicReport,
  type Report,
  type WaterStatus,
} from '@tem-agua/contracts';

const STORAGE_KEY = 'tem-agua:my-reports:v2';
const API = '/api';
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const RECONNECT_MS = 5000;

export type LiveStatus = 'connecting' | 'online' | 'offline';

/**
 * Dono dos relatos. Junta três fontes e publica o resultado no barramento ('reports'):
 * - demonstração (fictícios, gerados no aparelho);
 * - servidor: relatos de todos os aparelhos, com posição arredondada, recebidos em tempo real (WebSocket);
 * - os deste aparelho, com posição exata, guardados no localStorage.
 *
 * Um relato ativo por aparelho: relatar de novo o mesmo status renova o relato ativo (mesmo id), e o
 * status oposto encerra o anterior. O app já aplica isso na hora; o servidor confirma (e corrige, se
 * o aparelho perdeu o histórico local) na resposta do POST.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly demo = demoReports();
  private readonly remote = signal<Report[]>([]);
  private readonly mine = signal<Report[]>(loadMine());
  readonly live = signal<LiveStatus>('connecting');

  readonly reports = computed(() => {
    // O próprio relato também chega pelo servidor; aqui vale a versão local, com a posição exata.
    const mineIds = new Set(this.mine().map((r) => r.id));
    return [...this.demo, ...this.remote().filter((r) => !mineIds.has(r.id)), ...this.mine()];
  });

  constructor() {
    effect(() => emit('reports', this.reports()));
    effect(() => saveMine(this.mine()));
    on('report-submit', ({ status, reconfirmar }) => this.add(status, reconfirmar), { replay: false });
    this.connect();
  }

  /**
   * Novo relato na posição do pin. Com `reconfirmar` (resposta ao "Ainda sem água?"), usa a posição
   * daquele relato deste aparelho.
   */
  add(status: WaterStatus, reconfirmar?: string): void {
    const agora = Date.now();
    const origem = reconfirmar ? this.mine().find((r) => r.id === reconfirmar) : last('center');
    if (!origem) return;
    const posicao = { lng: origem.lng, lat: origem.lat, bairro: origem.bairro };
    const ativo = this.mine()
      .filter((r) => relatoAtivo(r, agora))
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    let report: Report;
    if (ativo?.status === status) {
      // Mesmo status: renova o relato ativo (mesmo id), com a posição nova.
      report = { ...ativo, ...posicao, confirmedAt: agora, synced: false };
      this.mine.update((list) => list.map((r) => (r.id === ativo.id ? report : r)));
    } else {
      // Status oposto (ou nenhum ativo): encerra o(s) anterior(es) e cria outro.
      report = { id: crypto.randomUUID(), ...posicao, status, createdAt: agora, mine: true, synced: false };
      this.mine.update((list) => [...list.map((r) => (relatoAtivo(r, agora) ? { ...r, closedAt: agora } : r)), report]);
    }
    void this.send(report);
  }

  /** Aplica a versão do servidor de um relato (novo, renovado ou encerrado). */
  private upsertRemote(report: Report): void {
    this.remote.update((list) =>
      list.some((r) => r.id === report.id) ? list.map((r) => (r.id === report.id ? report : r)) : [...list, report],
    );
  }

  private connect(): void {
    this.live.set('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}${API}/ws`);

    socket.addEventListener('open', () => {
      this.live.set('online');
      // Ao (re)conectar: busca o que chegou enquanto estava fora e reenvia o que ficou pendente.
      void this.refresh();
      for (const r of this.mine()) if (!r.synced) void this.send(r);
    });

    socket.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data as string) as { type: string; report?: Report };
      const report = msg.report;
      if (msg.type !== 'report' || !report) return;
      this.upsertRemote(report);
    });

    // Caiu (API reiniciou, celular trocou de rede, túnel oscilou): tenta de novo em alguns segundos.
    socket.addEventListener('close', () => {
      this.live.set('offline');
      setTimeout(() => this.connect(), RECONNECT_MS);
    });
  }

  private async refresh(): Promise<void> {
    try {
      // 7 dias: o mapa mostra 12 h, mas o ranking de bairros da home tem filtro de até 7 dias.
      const res = await fetch(`${API}/reports?horas=168`);
      if (res.ok) this.remote.set((await res.json()) as Report[]);
    } catch {
      // Sem rede: fica com o que já tem; o próximo 'open' tenta de novo.
    }
  }

  private async send(report: Report): Promise<void> {
    // Só a versão pública sai do aparelho: posição arredondada e sem campos locais.
    const { id, lng, lat, bairro, status } = toPublicReport(report);
    try {
      const res = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CABECALHO_APARELHO]: idDoAparelho() },
        body: JSON.stringify({ id, lng, lat, bairro, status }),
      });
      if (!res.ok) return;
      const { report: srv, encerrados = [] } = (await res.json()) as { report: Report; encerrados?: Report[] };
      this.mine.update((list) => {
        let out = list;
        // O servidor renovou outro relato ativo deste aparelho (ex.: o histórico local foi apagado):
        // o relato local passa a ter o id dele.
        if (srv.id !== id) out = out.filter((r) => r.id !== srv.id).map((r) => (r.id === id ? { ...r, id: srv.id } : r));
        const fechados = new Map(encerrados.map((e) => [e.id, e.closedAt]));
        return out.map((r) =>
          r.id === srv.id
            ? { ...r, createdAt: srv.createdAt, confirmedAt: srv.confirmedAt, closedAt: srv.closedAt, synced: true }
            : fechados.has(r.id)
              ? { ...r, closedAt: fechados.get(r.id) }
              : r,
        );
      });
      this.upsertRemote(srv);
      encerrados.forEach((e) => this.upsertRemote(e));
    } catch {
      // Fica pendente (synced: false) e é reenviado na próxima conexão.
    }
  }
}

function loadMine(): Report[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Report[];
    return list.filter((r) => Date.now() - r.createdAt < KEEP_MS);
  } catch {
    return [];
  }
}

function saveMine(list: Report[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Navegação privada ou armazenamento bloqueado: segue só em memória.
  }
}

/** Relatos fictícios, recalculados a cada carga para parecerem recentes. */
function demoReports(): Report[] {
  const clusters: Array<[bairro: string, semAgua: number, voltou: number]> = [
    ['Jardim Nair Maria', 14, 0],
    ['Residencial Santa Madre Paulina', 9, 1],
    ['Jardim Monte Paschoal', 6, 0],
    ['Vila Nova', 4, 3],
    ['Jardim Santa Marta', 0, 3],
    ['Jardim das Nações I', 3, 0],
  ];

  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const now = Date.now();
  const out: Report[] = [];

  for (const [nome, semAgua, voltou] of clusters) {
    const b = BAIRROS.find((x) => x.nome === nome);
    if (!b) continue;
    const add = (status: WaterStatus, maxAgeMin: number, minAgeMin: number) =>
      out.push({
        id: `demo-${out.length}`,
        lng: coarsen(b.lng + (rand() - 0.5) * 0.008),
        lat: coarsen(b.lat + (rand() - 0.5) * 0.008),
        bairro: b.nome,
        status,
        createdAt: now - (minAgeMin + rand() * (maxAgeMin - minAgeMin)) * 60_000,
        demo: true,
      });
    // "Sem água" mais antigos e "voltou" mais recentes, como num rodízio que acabou.
    for (let i = 0; i < semAgua; i++) add('sem-agua', 300, 20);
    for (let i = 0; i < voltou; i++) add('voltou', 15, 2);
  }
  return out;
}
