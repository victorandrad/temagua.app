import type { Routes } from '@angular/router';
import { MapaPage } from './mapa-page';

export const routes: Routes = [
  { path: '', component: MapaPage, title: "Tem Água? · Mapa da falta d'água em Salto/SP" },
  {
    path: 'metricas',
    loadComponent: () => import('./metricas-page').then((m) => m.MetricasPage),
    title: 'Métricas · Tem Água?',
  },
  // Relatórios mensais públicos: o remoto de métricas lê o endereço (/relatorios ou /relatorios/AAAA-MM).
  {
    path: 'relatorios',
    loadComponent: () => import('./metricas-page').then((m) => m.MetricasPage),
    title: 'Relatórios mensais · Tem Água?',
  },
  {
    path: 'relatorios/:mes',
    loadComponent: () => import('./metricas-page').then((m) => m.MetricasPage),
    title: "Relatório mensal de falta d'água · Tem Água?",
  },
  { path: '**', redirectTo: '' },
];
