// Tipos e chamadas da API de métricas (mesma origem: /api).

import type { FeatureCollection, Point } from 'geojson';

export interface Contagens {
  total: number;
  semAgua: number;
  voltou: number;
}

export interface Filtros {
  de: string;
  ate: string;
  bairro: string | null;
  demo: boolean;
}

export interface Metricas {
  filtros: Filtros & { dias: number };
  geradoEm: string;
  resumo: Contagens & {
    bairrosAfetados: number;
    /** Aparelhos diferentes que relataram falta (só os últimos 30 dias guardam o aparelho). */
    aparelhos: number;
    horaPico: number | null;
    temDemo: boolean;
    anterior: Contagens & { de: string; ate: string };
    ultimaHora: Contagens;
  };
  serie: { granularidade: 'hora' | 'dia'; pontos: Array<{ t: string; semAgua: number; voltou: number }> };
  semanaHora: Array<{ dow: number; hora: number; semAgua: number }>;
  bairros: Array<Contagens & { bairro: string; ultimo: string }>;
  pontos: FeatureCollection<Point, Contagens>;
  recentes: Array<{
    id: string;
    dia: string;
    hora: number;
    criadoEm: string;
    bairro: string;
    status: 'sem-agua' | 'voltou';
    lng: number;
    lat: number;
    origem: 'app' | 'demo';
  }>;
}

export function query(f: Filtros): string {
  const p = new URLSearchParams({ de: f.de, ate: f.ate, demo: f.demo ? '1' : '0' });
  if (f.bairro) p.set('bairro', f.bairro);
  return p.toString();
}

export async function fetchMetricas(f: Filtros, signal?: AbortSignal): Promise<Metricas> {
  const res = await fetch(`/api/metricas?${query(f)}`, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Não foi possível carregar as métricas.');
  return body as Metricas;
}

export async function fetchBairros(): Promise<string[]> {
  const res = await fetch('/api/metricas/bairros');
  return res.ok ? ((await res.json()) as string[]) : [];
}

export function csvUrl(f: Filtros): string {
  return `/api/relatorios/relatos.csv?${query(f)}`;
}

export interface RelatoMonitor {
  id: string;
  lng: number;
  lat: number;
  bairro: string;
  status: 'sem-agua' | 'voltou';
  createdAt: number;
}

/** Relatos das últimas `horas` horas, para o modo monitoramento. */
export async function fetchMonitor(horas: number, demo: boolean, signal?: AbortSignal): Promise<RelatoMonitor[]> {
  const res = await fetch(`/api/monitor?horas=${horas}&demo=${demo ? '1' : '0'}`, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Não foi possível carregar o monitoramento.');
  return body.relatos as RelatoMonitor[];
}
