import type { Bairro } from './types';
import dados from './bairros.json';

// Centroides aproximados dos bairros de Salto/SP extraídos do OpenStreetMap (© colaboradores do OSM, ODbL).
// Os dados ficam em JSON para a API (Node, sem TypeScript) usar a mesma lista nas páginas de SEO.
export const BAIRROS: Bairro[] = dados;
