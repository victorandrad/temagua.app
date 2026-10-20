import { createInstance } from '@module-federation/runtime';
import type { MountFn } from '@tem-agua/contracts';

/**
 * Onde cada microfrontend publica seu remoteEntry. Ficam na mesma origem do shell: no dev o
 * proxy.conf.json repassa para as portas 4201/4202; no deploy, publique cada remoto nesse caminho.
 * Mesma origem = sem CORS, worker do mapa liberado e um único endereço HTTPS (necessário pro GPS).
 */
export const REMOTES = {
  mapa: '/remotes/mapa/remoteEntry.js',
  painel: '/remotes/painel/remoteEntry.js',
} as const;

export type RemoteName = keyof typeof REMOTES;

// O shell usa só o runtime do Module Federation (sem plugin de bundler), então
// funciona com o builder esbuild padrão do Angular.
const federation = createInstance({
  name: 'shell',
  remotes: Object.entries(REMOTES).map(([name, path]) => ({
    name,
    entry: new URL(path, window.location.origin).href,
    type: 'module' as const,
  })),
});

export async function loadMount(name: RemoteName): Promise<MountFn> {
  const mod = await federation.loadRemote<{ mount: MountFn }>(`${name}/mount`);
  if (!mod?.mount) throw new Error(`O remoto "${name}" não expõe mount()`);
  return mod.mount;
}
