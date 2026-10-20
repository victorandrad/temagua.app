import { Component, DestroyRef, inject } from '@angular/core';
import { emit, on } from '@tem-agua/contracts';
import { RemoteSlot } from './remote-slot';
import { ReportsService } from './reports.service';
import { SearchBar } from './search-bar';

@Component({
  selector: 'app-root',
  imports: [RemoteSlot, SearchBar],
  template: `
    <main class="app">
      <!-- React: mapa em tela cheia -->
      <ta-remote-slot class="map fill" remote="mapa" loadingLabel="Carregando mapa…" errorLabel="O mapa não carregou." />

      <!-- Angular: busca de bairro -->
      <header class="top">
        <ta-search-bar />
        <div class="badges">
          <span class="badge live" [class.online]="live() === 'online'">
            <i aria-hidden="true"></i>{{ live() === 'online' ? 'Ao vivo' : 'Reconectando…' }}
          </span>
          @if (hasDemo) {
            <span class="badge">Dados de demonstração</span>
          }
        </div>
      </header>

      <!-- Vue: bottom sheet para relatar -->
      <ta-remote-slot class="sheet" remote="painel" loadingLabel="" errorLabel="O painel não carregou." />
    </main>
  `,
  styles: `
    .app { position: fixed; inset: 0; overflow: hidden; }
    .map { position: absolute; inset: 0; }
    .top {
      position: absolute; top: 0; left: 0; right: 0; z-index: 10;
      padding: calc(12px + env(safe-area-inset-top)) 16px 0;
      pointer-events: none;
    }
    .top > * { pointer-events: auto; }
    .badges { display: flex; gap: 6px; margin-top: 8px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
      border-radius: 999px; background: rgba(0, 0, 0, 0.72); color: #fff;
      font-size: 12px; font-weight: 500;
    }
    .live i { width: 7px; height: 7px; border-radius: 50%; background: #afafaf; }
    .live.online i { background: #05a357; box-shadow: 0 0 0 3px rgba(5, 163, 87, 0.3); }
    .sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; }

    @media (min-width: 768px) {
      .top { right: auto; width: 432px; }
      .sheet { top: 116px; bottom: auto; left: 16px; right: auto; width: 400px; }
    }
  `,
})
export class App {
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
          ? { top: 0, bottom: 0, left: 432, right: 0 }
          : { top: 88, bottom: sheetHeight, left: 0, right: 0 },
      );
    const off = on('sheet-height', (h) => {
      sheetHeight = h;
      update();
    });
    desktop.addEventListener('change', update);
    update();

    inject(DestroyRef).onDestroy(() => {
      off();
      desktop.removeEventListener('change', update);
    });
  }
}
