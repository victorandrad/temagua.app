import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RemoteSlot } from './remote-slot';
import { ReportsService } from './reports.service';

@Component({
  selector: 'ta-metricas-page',
  imports: [RemoteSlot, RouterLink],
  template: `
    <nav class="nav" aria-label="Navegação">
      <a class="brand" routerLink="/">
        <span class="drop" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor" /></svg>
        </span>
        Tem Água?
      </a>
      <span class="live" [class.online]="live() === 'online'">
        <i aria-hidden="true"></i>{{ live() === 'online' ? 'Conectado' : 'Reconectando…' }}
      </span>
      <a class="back" routerLink="/" aria-label="Voltar ao mapa">← <span class="back__texto">Voltar ao </span>mapa</a>
    </nav>

    <!-- Vue: painel de métricas e relatórios (no celular o remoto esconde monitoramento e PDF) -->
    <ta-remote-slot remote="metricas" [fechaSplash]="true" loadingLabel="Carregando métricas…" errorLabel="O painel de métricas não carregou." />
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: #f6f6f6; }
    .nav {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; gap: 16px;
      height: 56px; padding: 0 16px;
      background: #fff; box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
    }
    .brand { display: inline-flex; align-items: center; gap: 8px; color: #000; font-weight: 700; text-decoration: none; }
    .drop { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #000; color: #fff; }
    .live { display: inline-flex; align-items: center; gap: 6px; margin-right: auto; color: #5e5e5e; font-size: 12px; }
    .live i { width: 7px; height: 7px; border-radius: 50%; background: #afafaf; }
    .live.online i { background: #05a357; }
    .back {
      padding: 8px 12px; border-radius: 8px; background: #eee; color: #000;
      font-size: 13px; font-weight: 600; text-decoration: none;
    }
    .back:hover { background: #e2e2e2; }
    @media (max-width: 420px) { .back__texto { display: none; } }
    @media print { .nav { display: none; } :host { background: #fff; } }
  `,
})
export class MetricasPage {
  protected readonly live = inject(ReportsService).live;
}
