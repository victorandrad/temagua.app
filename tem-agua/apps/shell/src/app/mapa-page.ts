import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { bairroPorSlug, emit, on } from '@tem-agua/contracts';
import { RemoteSlot } from './remote-slot';
import { ReportsService } from './reports.service';
import { SearchBar } from './search-bar';
import { fecharSplash } from './splash';

/** Largura da barra lateral no desktop; o mapa recebe o mesmo valor de padding à esquerda. */
const LARGURA_LATERAL = 400;

@Component({
  selector: 'ta-mapa-page',
  imports: [RemoteSlot, SearchBar, RouterLink],
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
              <span class="badge">Dados de demonstração</span>
            }
            <a class="badge link" routerLink="/metricas">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M2 14V9h3v5H2Zm4.5 0V5h3v9h-3ZM11 14V2h3v12h-3Z" fill="currentColor" />
              </svg>
              Métricas
            </a>
          </div>
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
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; pointer-events: none; }
    .badges > * { pointer-events: auto; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
      border-radius: 999px; background: rgba(0, 0, 0, 0.72); color: #fff;
      font-size: 12px; font-weight: 500; text-decoration: none;
    }
    .badge.link { background: #fff; color: #000; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16); }
    .badge.link:hover { background: #f3f3f3; }
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
      .badges { pointer-events: auto; }
      .badge { background: #f1f1f1; color: #3a3a3a; }
      .badge.link { background: #000; color: #fff; box-shadow: none; }
      .badge.link:hover { background: #222; }
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

    inject(DestroyRef).onDestroy(() => {
      off();
      offMapa();
      desktop.removeEventListener('change', update);
    });
  }
}
