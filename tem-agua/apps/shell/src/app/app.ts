import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ReportsService } from './reports.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  // Mantém o WebSocket vivo em todas as telas: o mapa e o painel de métricas dependem dele
  // (o painel recarrega quando o barramento avisa que chegou relato novo).
  private readonly reports = inject(ReportsService);
}
