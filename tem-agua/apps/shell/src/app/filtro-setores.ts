import { Component, computed, ElementRef, inject, input, output } from '@angular/core';
import { SETORES_RESUMO } from '@tem-agua/contracts';

const TODOS = SETORES_RESUMO.map((s) => s.id);

/** "Todos os setores", "1 setor", "3 setores", "Nenhum setor" (rótulo do selo que abre o filtro). */
export function rotuloSetores(selecionados: string[] | null): string {
  if (selecionados === null) return 'Todos os setores';
  if (!selecionados.length) return 'Nenhum setor';
  return selecionados.length === 1 ? '1 setor' : `${selecionados.length} setores`;
}

/**
 * Escolha dos setores de abastecimento visíveis no mapa: um, vários ou todos.
 * `selecionados` null = todos (e continua "todos" se a lista de setores crescer).
 */
@Component({
  selector: 'ta-filtro-setores',
  host: {
    role: 'dialog',
    'aria-label': 'Setores de abastecimento no mapa',
    '(document:keydown.escape)': 'fechar.emit()',
    '(document:pointerdown)': 'foraDoFiltro($event)',
  },
  template: `
    <header class="cabeca">
      <div>
        <p class="titulo">Setores no mapa</p>
        <p class="sub">{{ resumo() }}</p>
      </div>
      <button type="button" class="fechar" aria-label="Fechar" (click)="fechar.emit()">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </header>
    <div class="acoes">
      <button type="button" [class.on]="selecionados() === null" (click)="mudar.emit(null)">Todos</button>
      <button type="button" [class.on]="selecionados()?.length === 0" (click)="mudar.emit([])">Nenhum</button>
    </div>
    <ul class="lista">
      @for (s of setores; track s.id) {
        <li [class.off]="!visivel(s.id)">
          <label>
            <input type="checkbox" [checked]="visivel(s.id)" (change)="alternar(s.id)" />
            <i class="cor" [style.background]="s.cor" aria-hidden="true"></i>
            <span class="nome">{{ s.nome }}</span>
            <small>{{ s.areas }} {{ s.areas === 1 ? 'área' : 'áreas' }}</small>
          </label>
          <button type="button" class="so" [attr.aria-label]="'Mostrar só o setor ' + s.nome" (click)="mudar.emit([s.id])">
            só este
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex; flex-direction: column;
      background: #fff; border-radius: 14px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
      overflow: hidden; font-size: 14px; color: #000;
    }
    .cabeca { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 14px 14px 8px 16px; }
    .titulo { margin: 0; font-weight: 600; font-size: 15px; }
    .sub { margin: 2px 0 0; color: #5e5e5e; font-size: 13px; }
    .fechar {
      display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%;
      background: #f1f1f1; color: #000; cursor: pointer;
    }
    .acoes { display: flex; gap: 6px; padding: 0 16px 10px; border-bottom: 1px solid #eee; }
    .acoes button {
      height: 30px; padding: 0 12px; border: 1px solid #ddd; border-radius: 999px;
      background: #fff; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
    }
    .acoes button.on { border-color: #000; background: #000; color: #fff; }
    .lista { margin: 0; padding: 4px 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; }
    li { display: flex; align-items: center; padding-right: 10px; }
    li:hover { background: #f7f7f7; }
    label { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; padding: 9px 4px 9px 16px; cursor: pointer; }
    input { width: 18px; height: 18px; margin: 0; accent-color: #000; flex: none; }
    .cor { width: 14px; height: 14px; border-radius: 4px; flex: none; }
    li.off .cor { opacity: 0.35; }
    .nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    small { color: #757575; font-size: 12px; white-space: nowrap; }
    .so {
      flex: none; height: 28px; padding: 0 10px; border: 0; border-radius: 999px;
      background: none; color: #1f4fb0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .so:hover { background: #eef3fe; }
  `,
})
export class FiltroSetores {
  readonly selecionados = input<string[] | null>(null);
  readonly mudar = output<string[] | null>();
  readonly fechar = output<void>();

  protected readonly setores = SETORES_RESUMO;
  protected readonly resumo = computed(() => {
    const sel = this.selecionados();
    if (sel === null) return `Todos os ${TODOS.length} setores visíveis`;
    if (!sel.length) return 'Nenhum setor visível';
    return `${sel.length} de ${TODOS.length} setores visíveis`;
  });

  private readonly el = inject(ElementRef<HTMLElement>);

  protected visivel(id: string): boolean {
    const sel = this.selecionados();
    return sel === null || sel.includes(id);
  }

  protected alternar(id: string): void {
    const atual = this.selecionados() ?? TODOS;
    const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
    // Marcou todos de novo: volta a "todos" (null).
    this.mudar.emit(nova.length === TODOS.length ? null : nova);
  }

  /** Toque fora do filtro fecha (o selo que abre/fecha cuida do próprio clique). */
  protected foraDoFiltro(e: PointerEvent): void {
    const alvo = e.target as Element | null;
    if (!alvo || this.el.nativeElement.contains(alvo) || alvo.closest('.filtro-chip')) return;
    this.fechar.emit();
  }
}
