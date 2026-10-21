import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { bairroPorSlug, emit, on, type Camadas } from '@tem-agua/contracts';
import { FiltroSetores, rotuloSetores } from './filtro-setores';
import { RemoteSlot } from './remote-slot';
import { ReportsService } from './reports.service';
import { SearchBar } from './search-bar';
import { fecharSplash } from './splash';

/** Largura da barra lateral no desktop; o mapa recebe o mesmo valor de padding à esquerda. */
const LARGURA_LATERAL = 400;
const CHAVE_ABASTECIMENTO = 'tem-agua:camada-abastecimento';
const CHAVE_SETORES = 'tem-agua:setores-visiveis';

function lerCamada(): boolean {
  try {
    return localStorage.getItem(CHAVE_ABASTECIMENTO) === '1';
  } catch {
    return false;
  }
}

/** Setores visíveis guardados (null = todos). */
function lerSetores(): string[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE_SETORES) ?? 'null');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

function salvar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // só não lembra a escolha
  }
}

@Component({
  selector: 'ta-mapa-page',
  imports: [RemoteSlot, SearchBar, RouterLink, FiltroSetores],
  template: `
    <main class="app">
      <!-- React: mapa em tela cheia -->
      <ta-remote-slot class="map fill" remote="mapa" loadingLabel="Carregando mapa…" errorLabel="O mapa não carregou." />

      <!-- Desktop: uma barra lateral só (busca + selos + painel), como no Google Maps.
           Celular: "display: contents" e cada parte volta a flutuar sobre o mapa. -->
      <aside class="lateral" aria-label="Busca e situação da água">
        <!-- Angular: busca de endereço/bairro -->
        <header class="top">
          <ta-search-bar />
          <div class="badges">
            <span class="badge live" [class.online]="live() === 'online'">
              <i aria-hidden="true"></i>{{ live() === 'online' ? 'Ao vivo' : 'Reconectando…' }}
            </span>
            @if (hasDemo) {
              <span class="badge" title="Inclui relatos fictícios de demonstração">Demonstração</span>
            }
            <button
              type="button"
              class="badge link toggle"
              [attr.aria-pressed]="abastecimento()"
              title="Áreas atendidas por cada reservatório"
              (click)="alternarAbastecimento()"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M3 4.5C3 3.1 5.2 2 8 2s5 1.1 5 2.5v7C13 12.9 10.8 14 8 14s-5-1.1-5-2.5v-7Zm1.5 0C4.5 5 5.9 6 8 6s3.5-1 3.5-1.5S10.1 3.5 8 3.5 4.5 4 4.5 4.5Z" fill="currentColor" />
              </svg>
              Reservatórios
            </button>
            @if (abastecimento()) {
              <button
                type="button"
                class="badge link filtro-chip"
                aria-haspopup="dialog"
                [attr.aria-expanded]="filtroAberto()"
                (click)="filtroAberto.set(!filtroAberto())"
              >
                {{ rotuloSetores(setores()) }}
                <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </button>
            }
            <a class="badge link" routerLink="/metricas">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M2 14V9h3v5H2Zm4.5 0V5h3v9h-3ZM11 14V2h3v12h-3Z" fill="currentColor" />
              </svg>
              Métricas
            </a>
          </div>
          @if (abastecimento() && filtroAberto()) {
            <ta-filtro-setores
              class="filtro"
              [selecionados]="setores()"
              (mudar)="escolherSetores($event)"
              (fechar)="filtroAberto.set(false)"
            />
          }
        </header>

        <!-- Vue: relatar + ranking (bottom sheet no celular) -->
        <ta-remote-slot class="sheet" remote="painel" loadingLabel="" errorLabel="O painel não carregou." />
      </aside>
    </main>
  `,
  styles: `
    .app { position: fixed; inset: 0; overflow: hidden; }
    .map { position: absolute; inset: 0; }
    .top {
      /* Acima do painel (z 10): sugestões da busca e selos nunca ficam por baixo dele. */
      position: absolute; top: 0; left: 0; right: 0; z-index: 20;
      padding: calc(12px + env(safe-area-inset-top)) 16px 0;
      pointer-events: none;
    }
    .top > * { pointer-events: auto; }
    /* Uma linha só (rola na horizontal se faltar espaço): duas linhas empurrariam o painel e o pin. */
    .badges {
      display: flex; gap: 6px; margin: 8px -16px 0; padding: 0 16px 6px;
      overflow-x: auto; scrollbar-width: none; pointer-events: none;
    }
    .badges::-webkit-scrollbar { display: none; }
    .badge { flex: none; white-space: nowrap; }
    .badges > * { pointer-events: auto; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
      border-radius: 999px; background: rgba(0, 0, 0, 0.72); color: #fff;
      font-size: 12px; font-weight: 500; text-decoration: none;
    }
    .badge.link { background: #fff; color: #000; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16); }
    .badge.link:hover { background: #f3f3f3; }
    button.badge { border: 0; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
    .toggle[aria-pressed='true'] { background: #276ef1; color: #fff; }
    .toggle[aria-pressed='true']:hover { background: #1e5fd6; }
    .filtro-chip[aria-expanded='true'] { background: #000; color: #fff; }
    /* Fora da faixa de selos (que rola na horizontal e cortaria o painel). */
    .filtro {
      position: absolute; top: calc(100% + 2px); left: 16px; right: 16px; z-index: 1;
      max-height: calc(100dvh - 200px - env(safe-area-inset-top));
    }
    .live i { width: 7px; height: 7px; border-radius: 50%; background: #afafaf; }
    .live.online i { background: #05a357; box-shadow: 0 0 0 3px rgba(5, 163, 87, 0.3); }
    .sheet {
      position: absolute; left: 0; right: 0; bottom: 0; z-index: 10;
      /* Altura máxima do bottom sheet: nunca sobe por baixo da busca e dos selos (~112 px). */
      --ta-sheet-max: calc(100dvh - 112px - env(safe-area-inset-top));
    }
    .lateral { display: contents; }

    @media (min-width: 768px) {
      .lateral {
        position: absolute; top: 0; bottom: 0; left: 0; z-index: 10;
        display: flex; flex-direction: column;
        width: 400px;
        overflow-y: auto; overscroll-behavior: contain;
        background: #fff; box-shadow: 2px 0 18px rgba(0, 0, 0, 0.14);
      }
      .top { position: sticky; top: 0; z-index: 2; padding: 14px 16px 10px; background: #fff; pointer-events: auto; }
      /* Na barra lateral o selo pode quebrar linha: não mexe no mapa. */
      .badges { pointer-events: auto; flex-wrap: wrap; overflow: visible; margin: 8px 0 0; padding: 0; }
      .badge { background: #f1f1f1; color: #3a3a3a; }
      .badge.link { background: #000; color: #fff; box-shadow: none; }
      .badge.link:hover { background: #222; }
      .toggle { background: #f1f1f1; color: #3a3a3a; }
      .toggle:hover { background: #e6e6e6; }
      .toggle[aria-pressed='true'] { background: #276ef1; color: #fff; }
      .filtro-chip { background: #f1f1f1; color: #3a3a3a; }
      .filtro-chip:hover { background: #e6e6e6; }
      .filtro-chip[aria-expanded='true'] { background: #000; color: #fff; }
      .filtro { max-height: calc(100dvh - 140px); }
      /* z-index auto: num item de flex o z-index vale mesmo com position static, e o 10 do
         celular punha o painel por cima do cabeçalho fixo (busca/selos). */
      .sheet { position: static; flex: 1; z-index: auto; --ta-sheet-max: none; }
    }
  `,
})
export class MapaPage {
  private readonly reports = inject(ReportsService);
  protected readonly hasDemo = this.reports.reports().some((r) => r.demo);
  protected readonly live = this.reports.live;
  /** Camada de reservatórios no mapa (lembrada no aparelho; o painel também pode ligar). */
  protected readonly abastecimento = signal(lerCamada());
  /** Setores visíveis na camada (null = todos), também lembrados no aparelho. */
  protected readonly setores = signal(lerSetores());
  protected readonly filtroAberto = signal(false);
  protected readonly rotuloSetores = rotuloSetores;

  private emitirCamadas(mudanca: Partial<Camadas>): void {
    emit('camadas', { abastecimento: this.abastecimento(), setores: this.setores(), ...mudanca });
  }

  protected alternarAbastecimento(): void {
    this.emitirCamadas({ abastecimento: !this.abastecimento() });
  }

  protected escolherSetores(setores: string[] | null): void {
    // Enquadra o mapa nos setores escolhidos (o mapa ignora isso no replay ao montar).
    this.emitirCamadas({ abastecimento: true, setores, enquadrar: true });
  }

  constructor() {
    // O shell é dono do layout: diz ao mapa quanto dele está coberto pela busca e pelo painel,
    // para o pin ficar no centro da área visível.
    const desktop = window.matchMedia('(min-width: 768px)');
    let sheetHeight = 0;
    const update = () =>
      emit(
        'map-padding',
        desktop.matches
          ? { top: 0, bottom: 0, left: LARGURA_LATERAL, right: 0 }
          : { top: 88, bottom: sheetHeight, left: 0, right: 0 },
      );
    // A splash some quando o mapa termina o primeiro desenho (evento do remoto React).
    // Link direto /?bairro=<slug> (usado pelas páginas de bairro indexadas no Google): abre o mapa no bairro.
    const destino = bairroPorSlug(new URLSearchParams(location.search).get('bairro') ?? '');
    const offMapa = on('map-ready', () => {
      fecharSplash();
      if (destino) {
        emit('fly-to', { lng: destino.lng, lat: destino.lat, zoom: 15.5 });
        // Usa uma vez só: tira o parâmetro para não voltar ao bairro ao navegar de volta para o mapa.
        history.replaceState(history.state, '', location.pathname);
      }
    });
    const off = on('sheet-height', (h) => {
      sheetHeight = h;
      update();
    });
    desktop.addEventListener('change', update);
    update();

    this.emitirCamadas({});
    const offCamadas = on('camadas', ({ abastecimento, setores = null }) => {
      this.abastecimento.set(abastecimento);
      this.setores.set(setores);
      if (!abastecimento) this.filtroAberto.set(false);
      salvar(CHAVE_ABASTECIMENTO, abastecimento ? '1' : '0');
      salvar(CHAVE_SETORES, JSON.stringify(setores));
    });

    inject(DestroyRef).onDestroy(() => {
      off();
      offMapa();
      offCamadas();
      desktop.removeEventListener('change', update);
    });
  }
}
