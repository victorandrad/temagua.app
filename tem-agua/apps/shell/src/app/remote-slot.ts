import { afterNextRender, Component, ElementRef, input, OnDestroy, signal, viewChild } from '@angular/core';
import { loadMount, type RemoteName } from './remotes';

/** Carrega um microfrontend remoto e o monta dentro deste elemento. Se falhar, só ele cai. */
@Component({
  selector: 'ta-remote-slot',
  template: `
    <div #host class="host"></div>
    @if (state() === 'loading') {
      <div class="status">{{ loadingLabel() }}</div>
    }
    @if (state() === 'error') {
      <div class="status error" role="alert">
        <span>{{ errorLabel() }}</span>
        <button type="button" (click)="load()">Tentar de novo</button>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .host { height: 100%; }
    .status {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      padding: 16px; font-size: 14px; color: #5e5e5e;
    }
    :host(.fill) .status { position: absolute; inset: 0; background: #eef0f2; }
    .error { background: #fff; border-radius: 16px 16px 0 0; }
    button {
      border: 0; border-radius: 999px; padding: 8px 14px;
      background: #000; color: #fff; font: inherit; font-weight: 600; cursor: pointer;
    }
  `,
})
export class RemoteSlot implements OnDestroy {
  readonly remote = input.required<RemoteName>();
  readonly loadingLabel = input('Carregando…');
  readonly errorLabel = input('Não foi possível carregar esta parte do app.');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private unmount?: () => void;

  constructor() {
    afterNextRender(() => this.load());
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const mount = await loadMount(this.remote());
      this.unmount?.();
      this.unmount = mount(this.host().nativeElement);
      this.state.set('ready');
    } catch (err) {
      console.error(`[shell] falha ao carregar o remoto "${this.remote()}"`, err);
      this.state.set('error');
    }
  }

  ngOnDestroy(): void {
    this.unmount?.();
  }
}
