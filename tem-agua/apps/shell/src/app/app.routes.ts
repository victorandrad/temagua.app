import type { Routes } from '@angular/router';
import { MapaPage } from './mapa-page';

export const routes: Routes = [
  { path: '', component: MapaPage, title: "Tem Água? · Mapa da falta d'água em Salto/SP" },
  {
    path: 'metricas',
    loadComponent: () => import('./metricas-page').then((m) => m.MetricasPage),
    title: 'Métricas · Tem Água?',
  },
  { path: '**', redirectTo: '' },
];
