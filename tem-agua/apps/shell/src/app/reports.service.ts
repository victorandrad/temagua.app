import { computed, effect, Injectable, signal } from '@angular/core';
import { BAIRROS, coarsen, emit, last, on, toPublicReport, type Report, type WaterStatus } from '@tem-agua/contracts';

const STORAGE_KEY = 'tem-agua:my-reports:v2';
const API = '/api';
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const RECONNECT_MS = 5000;

export type LiveStatus = 'connecting' | 'online' | 'offline';

/**
 * Dono dos relatos. Junta três fontes e publica o resultado no barramento ('reports'):
 * - demonstração (fictícios, gerados no aparelho);
 * - servidor: relatos de todos os aparelhos, com posição arredondada, recebidos em tempo real (SSE);
 * - os deste aparelho, com posição exata, guardados no localStorage.
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
    on('report-submit', ({ status }) => this.add(status), { replay: false });
    this.connect();
  }

  add(status: WaterStatus): void {
    const center = last('center');
    if (!center) return;
    const report: Report = {
      id: crypto.randomUUID(),
      lng: center.lng,
      lat: center.lat,
      bairro: center.bairro,
      status,
      createdAt: Date.now(),
      mine: true,
      synced: false,
    };
    this.mine.update((list) => [...list, report]);
    void this.send(report);
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
      this.remote.update((list) => (list.some((r) => r.id === report.id) ? list : [...list, report]));
    });

    // Caiu (API reiniciou, celular trocou de rede, túnel oscilou): tenta de novo em alguns segundos.
    socket.addEventListener('close', () => {
      this.live.set('offline');
      setTimeout(() => this.connect(), RECONNECT_MS);
    });
  }

  private async refresh(): Promise<void> {
    try {
      const res = await fetch(`${API}/reports`);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, lng, lat, bairro, status }),
      });
      if (!res.ok) return;
      this.mine.update((list) => list.map((r) => (r.id === id ? { ...r, synced: true } : r)));
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
