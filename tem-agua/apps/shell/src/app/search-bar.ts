import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { emit, searchBairros } from '@tem-agua/contracts';

type Tipo = 'local' | 'recente' | 'bairro' | 'rua' | 'lugar' | 'endereco';

interface Sugestao {
  id: string;
  tipo: Tipo;
  titulo: string;
  subtitulo: string;
  lng?: number;
  lat?: number;
}

const RECENTES_KEY = 'tem-agua:buscas-recentes';
const MAX_RECENTES = 5;
const DEBOUNCE_MS = 250;

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Divide o título em trechos, marcando o que casa com o texto digitado (negrito, como no Google Maps). */
function destacar(titulo: string, termo: string): Array<{ t: string; m: boolean }> {
  const q = norm(termo.trim());
  if (!q) return [{ t: titulo, m: false }];
  const i = norm(titulo).indexOf(q);
  if (i < 0) return [{ t: titulo, m: false }];
  // Tirar os acentos após o NFD deixa um caractere por letra (texto com acentos pré-compostos, o normal),
  // então as posições no texto normalizado valem para o original.
  return [
    { t: titulo.slice(0, i), m: false },
    { t: titulo.slice(i, i + q.length), m: true },
    { t: titulo.slice(i + q.length), m: false },
  ].filter((p) => p.t);
}

function lerRecentes(): Sugestao[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENTES_KEY) ?? '[]') as Sugestao[]).slice(0, MAX_RECENTES);
  } catch {
    return [];
  }
}

@Component({
  selector: 'ta-search-bar',
  template: `
    <div class="bar" [class.open]="aberto()">
      <span class="brand" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor" /></svg>
      </span>
      <input
        #input
        type="search"
        role="combobox"
        aria-label="Buscar endereço ou bairro em Salto"
        aria-controls="ta-search-results"
        aria-autocomplete="list"
        [attr.aria-expanded]="aberto()"
        [attr.aria-activedescendant]="ativo() >= 0 ? 'ta-sug-' + ativo() : null"
        placeholder="Buscar endereço ou bairro"
        autocomplete="off"
        enterkeyhint="search"
        [value]="query()"
        (input)="digitar(input.value)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false)"
        (keydown)="teclado($event)"
      />
      @if (carregando()) {
        <span class="spinner" aria-hidden="true"></span>
      }
      @if (query()) {
        <button type="button" class="clear" aria-label="Limpar busca" (mousedown)="$event.preventDefault()" (click)="limpar()">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      }
    </div>

    @if (aberto()) {
      <ul id="ta-search-results" class="results" role="listbox" aria-label="Sugestões">
        @if (!query().trim() && recentes().length) {
          <li class="secao" role="presentation">Buscas recentes</li>
        }
        @for (s of sugestoes(); track s.id; let i = $index) {
          <li [id]="'ta-sug-' + i" role="option" [attr.aria-selected]="ativo() === i">
            <button
              type="button"
              tabindex="-1"
              [class.ativo]="ativo() === i"
              (mousedown)="$event.preventDefault()"
              (mouseenter)="ativo.set(i)"
              (click)="escolher(s)"
            >
              <span class="icon" [class]="'icon is-' + s.tipo" aria-hidden="true">
                @switch (s.tipo) {
                  @case ('local') {
                    <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="4" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2" /></svg>
                  }
                  @case ('recente') {
                    <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                  }
                  @case ('rua') {
                    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 3 6 21M15 3l3 18M12 5v2M12 11v2M12 17v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                  }
                  @case ('lugar') {
                    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 21V9l8-5 8 5v12h-5v-6H9v6H4Z" fill="currentColor" /></svg>
                  }
                  @case ('bairro') {
                    <svg viewBox="0 0 24 24" width="16" height="16"><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="2" /></svg>
                  }
                  @default {
                    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" fill="currentColor" /><circle cx="12" cy="10" r="2.5" fill="#fff" /></svg>
                  }
                }
              </span>
              <span class="text">
                <!-- Uma linha só: quebras de linha aqui virariam espaços entre os trechos. -->
                <span class="name">@for (p of destacar(s.titulo); track $index) {<span [class.match]="p.m">{{ p.t }}</span>}</span>
                <span class="city">{{ s.subtitulo }}</span>
              </span>
            </button>
          </li>
        }
        @if (query().trim().length >= 3 && !carregando() && !sugestoes().length) {
          <li class="vazio" role="presentation">Nenhum endereço encontrado em Salto.</li>
        }
        @if (erro()) {
          <li class="vazio" role="presentation">{{ erro() }}</li>
        }
        @if (temResultadosRemotos()) {
          <li class="creditos" role="presentation">Endereços © colaboradores do OpenStreetMap</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .bar {
      display: flex; align-items: center; gap: 10px;
      height: 52px; padding: 0 8px 0 10px;
      border-radius: 12px; background: #fff;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
    }
    .bar.open { border-radius: 12px 12px 0 0; }
    .brand {
      display: grid; place-items: center; flex: none;
      width: 32px; height: 32px; border-radius: 50%;
      background: #000; color: #fff;
    }
    input {
      flex: 1; min-width: 0; height: 100%;
      border: 0; outline: 0; background: none;
      font: inherit; font-size: 16px; font-weight: 500; color: #000;
    }
    input::placeholder { color: #6b6b6b; }
    input::-webkit-search-cancel-button { display: none; }
    .spinner {
      flex: none; width: 16px; height: 16px;
      border: 2px solid #ddd; border-top-color: #000; border-radius: 50%;
      animation: girar 0.8s linear infinite;
    }
    @keyframes girar { to { transform: rotate(360deg); } }
    .clear {
      display: grid; place-items: center; width: 32px; height: 32px; flex: none;
      border: 0; border-radius: 50%; background: #f3f3f3; color: #000; cursor: pointer;
    }
    .results {
      position: absolute; left: 0; right: 0; top: 52px; z-index: 30;
      max-height: min(420px, calc(100vh - 120px)); overflow-y: auto;
      margin: 0; padding: 4px 0 8px; list-style: none;
      border-top: 1px solid #eee; border-radius: 0 0 12px 12px;
      background: #fff; box-shadow: 0 12px 16px rgba(0, 0, 0, 0.14);
    }
    .results button {
      display: flex; align-items: center; gap: 14px; width: 100%;
      padding: 9px 14px; border: 0; background: none;
      font: inherit; text-align: left; cursor: pointer;
    }
    .results button.ativo { background: #f3f3f3; }
    .icon {
      display: grid; place-items: center; flex: none;
      width: 32px; height: 32px; border-radius: 50%; background: #eee; color: #000;
    }
    .icon.is-local { background: #e8f0fe; color: #276ef1; }
    .text { display: flex; flex-direction: column; min-width: 0; }
    .name { overflow: hidden; font-size: 15px; color: #3a3a3a; white-space: nowrap; text-overflow: ellipsis; }
    .name .match { color: #000; font-weight: 700; }
    .city { overflow: hidden; font-size: 13px; color: #6b6b6b; white-space: nowrap; text-overflow: ellipsis; }
    .secao { padding: 8px 14px 4px; color: #6b6b6b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .vazio { padding: 12px 14px; color: #6b6b6b; font-size: 14px; }
    .creditos { padding: 6px 14px 0; color: #9a9a9a; font-size: 11px; }

    /* Dentro da barra lateral do desktop: sem sombra flutuante, com contorno. */
    @media (min-width: 768px) {
      .bar { box-shadow: none; border: 1px solid #e2e2e2; background: #f7f7f7; }
      .bar:focus-within { background: #fff; border-color: #000; }
      .bar.open { border-bottom-color: transparent; }
      .results { border: 1px solid #000; border-top: 1px solid #eee; box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12); }
    }
  `,
})
export class SearchBar {
  protected readonly query = signal('');
  protected readonly focused = signal(false);
  protected readonly ativo = signal(-1);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  private readonly remotos = signal<Sugestao[]>([]);
  protected readonly recentes = signal<Sugestao[]>(lerRecentes());
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** Vazio: "Sua localização" + recentes. Digitando: bairros (na hora, offline) + endereços da API. */
  protected readonly sugestoes = computed<Sugestao[]>(() => {
    const q = this.query().trim();
    if (!q) {
      return [
        { id: 'local', tipo: 'local', titulo: 'Sua localização', subtitulo: 'Usar o GPS do aparelho' },
        ...this.recentes().map((r) => ({ ...r, id: `recente-${r.id}`, tipo: 'recente' as const })),
      ];
    }
    const bairros: Sugestao[] = searchBairros(q, 3).map((b) => ({
      id: `bairro-${b.nome}`,
      tipo: 'bairro',
      titulo: b.nome,
      subtitulo: 'Bairro · Salto - SP',
      lng: b.lng,
      lat: b.lat,
    }));
    const nomes = new Set(bairros.map((b) => norm(b.titulo)));
    const remotos = this.remotos().filter((r) => !(r.tipo === 'bairro' && nomes.has(norm(r.titulo))));
    return [...bairros, ...remotos].slice(0, 8);
  });

  protected readonly aberto = computed(() => this.focused() && (this.sugestoes().length > 0 || this.query().trim().length >= 3));
  protected readonly temResultadosRemotos = computed(() => this.query().trim().length > 0 && this.remotos().length > 0);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.controller?.abort();
    });
  }

  protected destacar(titulo: string) {
    return destacar(titulo, this.query());
  }

  protected digitar(valor: string): void {
    this.query.set(valor);
    this.ativo.set(-1);
    this.erro.set(null);
    clearTimeout(this.timer);
    this.controller?.abort();
    const q = valor.trim();
    if (q.length < 3) {
      this.remotos.set([]);
      this.carregando.set(false);
      return;
    }
    this.carregando.set(true);
    // Espera a pessoa parar de digitar um instante antes de consultar a API.
    this.timer = setTimeout(() => this.buscar(q), DEBOUNCE_MS);
  }

  private async buscar(q: string): Promise<void> {
    this.controller = new AbortController();
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: this.controller.signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Busca de endereços indisponível.');
      if (this.query().trim() !== q) return; // a pessoa já digitou outra coisa
      this.remotos.set(body as Sugestao[]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      this.remotos.set([]);
      this.erro.set((e as Error).message);
    } finally {
      if (this.query().trim() === q) this.carregando.set(false);
    }
  }

  protected teclado(e: KeyboardEvent): void {
    const n = this.sugestoes().length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.ativo.update((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.ativo.update((i) => (i <= 0 ? n - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = this.sugestoes()[this.ativo() >= 0 ? this.ativo() : 0];
      if (s) this.escolher(s);
    } else if (e.key === 'Escape') {
      this.input().nativeElement.blur();
    }
  }

  protected escolher(s: Sugestao): void {
    if (s.tipo === 'local') {
      emit('locate', null);
      this.query.set('');
    } else if (s.lng !== undefined && s.lat !== undefined) {
      // Bairro mostra a região; endereço/lugar chega mais perto, como no Google Maps.
      emit('fly-to', { lng: s.lng, lat: s.lat, zoom: s.tipo === 'bairro' || s.tipo === 'recente' ? 15.5 : 17 });
      this.query.set(s.titulo);
      this.lembrar(s);
    }
    this.ativo.set(-1);
    this.input().nativeElement.blur();
  }

  protected limpar(): void {
    this.digitar('');
    this.input().nativeElement.focus();
  }

  private lembrar(s: Sugestao): void {
    const item: Sugestao = { ...s, id: norm(`${s.titulo}|${s.subtitulo}`), tipo: s.tipo === 'recente' ? 'endereco' : s.tipo };
    const lista = [item, ...this.recentes().filter((r) => r.id !== item.id)].slice(0, MAX_RECENTES);
    this.recentes.set(lista);
    try {
      localStorage.setItem(RECENTES_KEY, JSON.stringify(lista));
    } catch {
      // armazenamento bloqueado: só não lembra
    }
  }
}
