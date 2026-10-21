import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RemoteSlot } from './remote-slot';
import { ReportsService } from './reports.service';
import { fecharSplash } from './splash';
import { telaGrande } from './tela-grande';

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
      @if (grande()) {
        <a class="back" routerLink="/">← Voltar ao mapa</a>
      }
    </nav>

    @if (grande()) {
      <!-- Vue: painel de métricas e relatórios -->
      <ta-remote-slot remote="metricas" [fechaSplash]="true" loadingLabel="Carregando métricas…" errorLabel="O painel de métricas não carregou." />
    } @else {
      <!-- Tela pequena: o remoto nem é carregado. -->
      <section class="aviso" aria-labelledby="aviso-titulo">
        <span class="aviso__icone" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-10Z M8 20h8 M12 17v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </span>
        <h1 id="aviso-titulo">O painel de métricas é para telas grandes</h1>
        <p>
          Gráficos, tabelas e relatórios precisam de espaço: abra num computador, notebook ou TV
          (tela com pelo menos 1024 px de largura). No celular, o mapa já mostra a situação do seu bairro e o ranking.
        </p>
        <div class="aviso__acoes">
          <a class="btn" routerLink="/">Voltar ao mapa</a>
          <button type="button" class="btn sec" (click)="copiarLink()">{{ copiado() ? 'Link copiado' : 'Copiar link para o computador' }}</button>
        </div>
      </section>
    }
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
    .aviso {
      box-sizing: border-box; width: calc(100% - 32px); max-width: 440px; margin: 32px auto; padding: 28px 22px; border-radius: 16px;
      background: #fff; text-align: center; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .aviso__icone { display: inline-grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: #f1f1f1; }
    .aviso h1 { margin: 16px 0 8px; font-size: 20px; line-height: 1.3; }
    .aviso p { margin: 0; color: #4b4b4b; font-size: 15px; line-height: 1.5; }
    .aviso__acoes { display: grid; gap: 8px; margin-top: 22px; }
    .btn {
      display: grid; place-items: center; height: 48px; border: 0; border-radius: 10px;
      background: #000; color: #fff; font: inherit; font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer;
    }
    .btn.sec { background: #eee; color: #000; }
    @media print { .nav { display: none; } :host { background: #fff; } }
  `,
})
export class MetricasPage {
  protected readonly live = inject(ReportsService).live;
  protected readonly grande = telaGrande();
  protected readonly copiado = signal(false);

  constructor() {
    // Sem o remoto, ninguém fecha a splash: fecha aqui.
    effect(() => {
      if (!this.grande()) fecharSplash();
    });
  }

  protected async copiarLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2500);
    } catch {
      // Sem permissão de área de transferência: o endereço continua na barra do navegador.
    }
  }
}
