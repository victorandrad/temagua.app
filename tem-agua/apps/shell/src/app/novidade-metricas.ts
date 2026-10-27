import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { on } from '@tem-agua/contracts';

/** Mostrado uma vez por aparelho; trocar a versão da chave faz a novidade aparecer de novo para todos. */
const CHAVE = 'tem-agua:novidade-metricas-celular:v1';
const FOLGA = 6;

function jaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'visto';
  } catch {
    return true; // sem localStorage: não insiste a cada visita
  }
}

/**
 * Novidade na home: "o painel de métricas agora abre no celular". Depois que o mapa desenha (splash
 * fechada), acende o selo "Métricas" (o resto da tela escurece) com um balão: "Ver métricas" leva
 * ao painel (que tem o próprio tour) e "Agora não" fecha. Uma vez por aparelho; Esc fecha.
 */
@Component({
  selector: 'ta-novidade-metricas',
  template: `
    @if (caixa(); as c) {
      <div class="fundo" (click)="fechar()"></div>
      <!-- O próprio selo aceso também abre o painel. -->
      <button
        type="button"
        class="holofote"
        [style.top.px]="c.top"
        [style.left.px]="c.left"
        [style.width.px]="c.width"
        [style.height.px]="c.height"
        aria-label="Abrir o painel de métricas"
        (click)="verMetricas()"
      ></button>
      <section
        class="balao"
        role="dialog"
        aria-labelledby="novidade-titulo"
        aria-describedby="novidade-texto"
        [style.top.px]="c.top + c.height + 14"
        [style.left.px]="balaoLeft()"
      >
        <span class="seta" [style.left.px]="setaLeft()" aria-hidden="true"></span>
        <p class="eyebrow">Novidade</p>
        <h2 id="novidade-titulo">{{ celular() ? 'Métricas no seu celular' : 'Métricas agora também no celular' }}</h2>
        <p id="novidade-texto">
          Veja quantas vezes faltou água no seu bairro, os horários em que mais falta e os reservatórios
          com mais problemas{{ celular() ? ', direto daqui.' : '. O painel abre em qualquer tela.' }}
        </p>
        <div class="acoes">
          <button type="button" class="sec" (click)="fechar()">Agora não</button>
          <button type="button" class="pri" (click)="verMetricas()" #principal>Ver métricas</button>
        </div>
      </section>
    }
  `,
  styles: `
    .fundo { position: fixed; inset: 0; z-index: 1000; }
    .holofote {
      position: fixed; z-index: 1001; padding: 0; border: 0; border-radius: 999px; background: transparent;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55); outline: 3px solid #fff; cursor: pointer;
      animation: brilho 1.6s ease-in-out infinite;
    }
    @keyframes brilho { 50% { outline-color: rgba(255, 255, 255, 0.55); } }
    .balao {
      position: fixed; z-index: 1002; box-sizing: border-box; width: min(320px, calc(100vw - 24px));
      padding: 16px; border-radius: 14px; background: #fff; color: #000;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3); text-align: left;
    }
    .seta {
      position: absolute; top: -7px; width: 14px; height: 14px; margin-left: -7px;
      background: #fff; transform: rotate(45deg); border-radius: 2px;
    }
    .eyebrow { margin: 0 0 4px; color: #276ef1; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    h2 { margin: 0 0 6px; font-size: 17px; line-height: 1.25; }
    p { margin: 0; color: #333; font-size: 14px; line-height: 1.5; }
    .acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .acoes button { height: 38px; padding: 0 14px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .pri { background: #000; color: #fff; }
    .sec { background: #eee; color: #000; }
    .acoes button:focus-visible, .holofote:focus-visible { outline: 3px solid #276ef1; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .holofote { animation: none; } }
  `,
})
export class NovidadeMetricas {
  /** O selo "Métricas" da home. */
  readonly alvo = input.required<HTMLElement>();

  private readonly router = inject(Router);
  protected readonly caixa = signal<{ top: number; left: number; width: number; height: number } | null>(null);
  protected readonly celular = signal(innerWidth < 768);
  protected readonly balaoLeft = signal(12);
  protected readonly setaLeft = signal(24);

  private readonly medir = () => {
    if (!this.caixa()) return;
    const r = this.alvo().getBoundingClientRect();
    this.celular.set(innerWidth < 768);
    const caixa = { top: r.top - FOLGA, left: r.left - FOLGA, width: r.width + 2 * FOLGA, height: r.height + 2 * FOLGA };
    this.caixa.set(caixa);
    // Balão embaixo do selo, dentro da tela; a seta aponta para o meio do selo.
    const largura = Math.min(320, innerWidth - 24);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - largura / 2), innerWidth - largura - 12);
    this.balaoLeft.set(left);
    this.setaLeft.set(r.left + r.width / 2 - left);
  };

  private readonly tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.caixa()) this.fechar();
  };

  constructor() {
    if (jaVisto()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Depois do primeiro desenho do mapa (a splash fecha nesse momento, com no mínimo 700 ms).
    const off = on('map-ready', () => {
      timer = setTimeout(() => this.abrir(), 1400);
    });
    addEventListener('resize', this.medir);
    addEventListener('keydown', this.tecla);
    inject(DestroyRef).onDestroy(() => {
      off();
      clearTimeout(timer);
      removeEventListener('resize', this.medir);
      removeEventListener('keydown', this.tecla);
    });
  }

  private abrir(): void {
    const el = this.alvo();
    if (jaVisto() || !el.isConnected) return;
    // No celular a fila de selos rola para o lado: traz o "Métricas" para a vista.
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.caixa.set({ top: 0, left: 0, width: 0, height: 0 });
    this.medir();
    setTimeout(() => (document.querySelector('ta-novidade-metricas .pri') as HTMLElement | null)?.focus());
  }

  protected fechar(): void {
    this.caixa.set(null);
    try {
      localStorage.setItem(CHAVE, 'visto');
    } catch {
      // sem localStorage: a novidade pode aparecer de novo
    }
  }

  protected verMetricas(): void {
    this.fechar();
    void this.router.navigateByUrl('/metricas');
  }
}
