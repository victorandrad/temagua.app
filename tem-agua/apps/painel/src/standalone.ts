import { emit, SALTO_CENTER } from '@tem-agua/contracts';
import { mount } from './mount';

// Sem o shell e o mapa, simula o centro do mapa para o painel ter contexto.
emit('center', { ...SALTO_CENTER, bairro: 'Centro' });
mount(document.getElementById('root')!);
