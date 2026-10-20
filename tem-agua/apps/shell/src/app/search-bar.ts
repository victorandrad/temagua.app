import { Component, computed, ElementRef, signal, viewChild } from '@angular/core';
import { emit, searchBairros, type Bairro } from '@tem-agua/contracts';

@Component({
  selector: 'ta-search-bar',
  template: `
    <div class="bar" [class.open]="showResults()">
      <span class="brand" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor" /></svg>
      </span>
      <input
        #input
        type="search"
        role="combobox"
        aria-label="Buscar bairro em Salto"
        aria-controls="ta-search-results"
        [attr.aria-expanded]="showResults()"
        placeholder="Buscar bairro em Salto"
        autocomplete="off"
        [value]="query()"
        (input)="query.set(input.value)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false)"
        (keydown.enter)="pick(results()[0])"
        (keydown.escape)="input.blur()"
      />
      @if (query()) {
        <button type="button" class="clear" aria-label="Limpar busca" (mousedown)="$event.preventDefault()" (click)="query.set('')">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      }
    </div>

    @if (showResults()) {
      <ul id="ta-search-results" class="results" role="listbox">
        @for (b of results(); track b.nome) {
          <li role="option" aria-selected="false">
            <button type="button" (mousedown)="$event.preventDefault()" (click)="pick(b)">
              <span class="icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" fill="currentColor" /><circle cx="12" cy="10" r="2.5" fill="#fff" /></svg>
              </span>
              <span class="text">
                <span class="name">{{ b.nome }}</span>
                <span class="city">Salto, SP</span>
              </span>
            </button>
          </li>
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
    .clear {
      display: grid; place-items: center; width: 32px; height: 32px;
      border: 0; border-radius: 50%; background: #f3f3f3; color: #000; cursor: pointer;
    }
    .results {
      position: absolute; left: 0; right: 0; top: 52px;
      margin: 0; padding: 4px 0 8px; list-style: none;
      border-top: 1px solid #eee; border-radius: 0 0 12px 12px;
      background: #fff; box-shadow: 0 12px 16px rgba(0, 0, 0, 0.14);
    }
    .results button {
      display: flex; align-items: center; gap: 14px; width: 100%;
      padding: 10px 14px; border: 0; background: none;
      font: inherit; text-align: left; cursor: pointer;
    }
    .results button:hover, .results button:focus-visible { background: #f6f6f6; outline: 0; }
    .icon {
      display: grid; place-items: center; flex: none;
      width: 32px; height: 32px; border-radius: 50%; background: #eee; color: #000;
    }
    .text { display: flex; flex-direction: column; }
    .name { font-size: 15px; font-weight: 500; }
    .city { font-size: 13px; color: #6b6b6b; }
  `,
})
export class SearchBar {
  protected readonly query = signal('');
  protected readonly focused = signal(false);
  protected readonly results = computed(() => searchBairros(this.query()));
  protected readonly showResults = computed(() => this.focused() && this.results().length > 0);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected pick(b?: Bairro): void {
    if (!b) return;
    emit('fly-to', { lng: b.lng, lat: b.lat, zoom: 15 });
    this.query.set(b.nome);
    this.input().nativeElement.blur();
  }
}
