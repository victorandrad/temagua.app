# Tem Água? · Salto/SP

Mapa colaborativo de falta d'água em Salto/SP: moradores marcam no mapa "estou sem água" ou "a água voltou" e todo mundo vê em tempo real.

- **App**: [`tem-agua/`](tem-agua/README.md) — microfrontends Angular (shell) + React (mapa) + Vue (painel) com Module Federation, e API Node com WebSocket.
- **Pesquisa**: [`pesquisa-problemas-salto.md`](pesquisa-problemas-salto.md) — problemas da cidade que motivaram o produto.

## Rodando

Requer Node 20.19+.

```bash
npm run dev        # http://localhost:4200
npm run dev:ngrok  # + link HTTPS público (precisa de NGROK_AUTHTOKEN em tem-agua/.env.local)
npm run stop
```

No Windows: `iniciar.cmd` / `parar.cmd`. Detalhes em [`tem-agua/README.md`](tem-agua/README.md).
