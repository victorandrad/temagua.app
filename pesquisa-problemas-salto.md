# Problemas reais de Salto/SP: pesquisa para a startup

*Pesquisa feita em 20/10/2026 com base em notícias locais (TVS+, Jornal Cruzeiro, Gazeta SP), comunicados do SAAE e dados do IBGE.*

> **Limitação:** não tive acesso a volume de buscas (Google Trends) nem a dados da Ouvidoria municipal. O ranking abaixo usa a **frequência de notícias e reclamações públicas** como indicador do que mais incomoda a população.

## Contexto da cidade
- População: 134.319 (Censo 2022), com estimativa de **141.111 em 2025**. A cidade cresce rápido.
- PIB per capita de R$ 85,6 mil (2023), com base industrial forte. É Estância Turística desde 1998.
- Mais de 40 loteamentos (horizontais e verticais) foram aprovados nos últimos anos, e a infraestrutura não acompanhou.

## Ranking de problemas

| # | Problema | Evidências | Intensidade |
|---|----------|------------|-------------|
| 1 | **Falta de água / abastecimento** | Emergência hídrica decretada em 31/12/2025, rodízio de 24h com e 24h sem água, 15 caminhões-pipa e 3,2 milhões de litros por semana. Em 16/10/2026 uma enchente parou a ETA João Jabour e deixou ~15% da cidade sem água. Há queixas recorrentes no Reclame Aqui (Nair Maria, Madre Paulina, Barnabé). O MP apura improbidade no SAAE. | Muito alta |
| 2 | **Esgoto e buracos (infraestrutura antiga)** | No Jd. São João o esgoto rompe há ~15 anos e novas torres devem sobrecarregar a rede. (Correção: a notícia de buracos no "Testo Salto" que citei antes é de Blumenau/SC, não de Salto/SP.) | Alta |
| 3 | **Segurança** | Furtos em série em barbearias (out/2026), quadrilha que invadiu um condomínio (mai/2026) e violência doméstica recorrente. | Alta |
| 4 | **Rio Tietê: poluição e cheias** | Espuma tóxica (mai/2026), transbordamento (jun/2026), lixo nas margens (set/2026) e monitoramento da Defesa Civil. | Média e sazonal |
| 5 | **Trânsito nas rodovias** | Mortes de motociclistas e acidentes na Rod. Santos Dumont. | Média |
| 6 | **Turismo pouco explorado** | Não há dados de visitação. O Complexo da Cachoeira recebeu R$ 1,2 mi de revitalização. | Oportunidade |

## Por que a água é o melhor problema para começar
1. **Dor aguda e recorrente**: as pessoas compram água, perdem dias de trabalho e passam o Natal sem água.
2. **Falha de informação**: o morador só descobre que vai faltar água quando a torneira seca. O rodízio é comunicado por post no Instagram, e o atendimento do 0800 chegou a negar que houvesse falta no bairro.
3. **A situação vai piorar antes de melhorar**: há mais loteamentos, ondas de calor, e a nova ETA do Buru (PAC, R$ 36 mi) ainda vai levar tempo.
4. **Já existem pagadores**: condomínios, comércio (restaurantes, salões, barbearias), clínicas e moradores que hoje gastam com caixa d'água extra, cisterna e caminhão-pipa particular.

## Ideias de produto

### A) "Tem Água?": alertas e mapa colaborativo do abastecimento (recomendada)
- **O que é**: bot de WhatsApp em que o morador informa o bairro e recebe aviso de rodízio, manutenção e retorno da água. Ele também pode reportar "estou sem água", o que gera um mapa ao vivo por bairro.
- **Por que funciona**: o custo de adoção é zero (WhatsApp), o efeito de rede é local e o produto gera dados que nem o SAAE expõe.
- **Monetização**:
  - **B2B condomínios/comércio**: sensor de nível da caixa d'água (IoT, custo ~R$ 150) com alerta de "sua reserva dura mais X horas" e assinatura de R$ 30–80/mês.
  - **Marketplace**: caminhão-pipa particular, encanadores, instalação de caixa d'água e cisternas (comissão).
  - **Patrocínio local**: lojas de material de construção.
  - **B2G (mais tarde)**: painel de dados para Prefeitura/SAAE e Câmara.
- **Expansão**: Itu, Indaiatuba e outras cidades com SAAE municipal e problema parecido.

### B) Zeladoria cidadã (buracos, esgoto, iluminação)
App para reportar e acompanhar problemas, com pressão pública via ranking. **Risco**: já existem concorrentes (Colab), e vender para prefeitura é lento. Pode virar um módulo do produto A.

### C) Rede de segurança do comércio
Grupo de alerta com câmeras compartilhadas entre comerciantes de uma rua. **Risco**: concorrência (Gabriel, Vizinhança Solidária) e necessidade de hardware.

### D) Guia turístico de Salto
**Risco**: pouca disposição a pagar e dor fraca. Funciona melhor como projeto paralelo.

## Plano de validação (30 dias, sem programar quase nada)
1. **Semana 1, entrevistas**: 15 moradores dos bairros mais afetados (Barnabé, Nair Maria, Madre Paulina, Santa Efigênia), 5 síndicos e 5 comerciantes. Perguntas: "Quanto você gastou na última falta d'água?" e "Como ficou sabendo?"
2. **Semana 1, pesquisa**: formulário nos grupos de Facebook e WhatsApp de Salto.
3. **Semanas 2–3, MVP manual**: um número de WhatsApp em que você mesmo repassa os avisos do SAAE por bairro e coleta os relatos de "sem água".
4. **Semana 4, teste de pagamento**: oferecer pré-venda do sensor para 10 condomínios ou comércios.
5. **Critério de sucesso**: mais de 300 cadastros em 30 dias **e** pelo menos 3 pré-vendas pagas.

## Revisão: onde NÃO há concorrência (20/10/2026)

### Concorrência de cada peça da ideia original
| Peça | Concorrência | Conclusão |
|------|--------------|-----------|
| Mapa colaborativo de falta d'água | Já existiu: "Tá faltando água" (3 mil denúncias em 5 dias), "Mapa da Falta D'água", "Cadê a água?" do ISA e mapa do Google. Todos de 2014–2015 e todos sumiram. | Sem concorrente hoje, mas **esse modelo já falhou**: era gratuito e não tinha receita. |
| Aviso de interrupção por WhatsApp | Concessionárias já fazem isso em outras cidades ("Comunica, Tubarão"). O SAAE Salto só publica nas redes sociais. | O SAAE pode lançar o mesmo serviço amanhã. **Não é uma barreira de entrada.** |
| Sensor de nível de caixa d'água | Syny, Olicon, kits Tuya e vendedores do Mercado Livre (R$ 770–1.290). | **Mercado já ocupado.** |
| **Previsão de falta d'água por bairro, para o morador** | Nada encontrado no Brasil. Fora do país, as soluções são para operadores (Emagin, Acciona BIONS). | **Vazio.** |
| **Entrega de caminhão-pipa sob demanda (consumidor/PME)** | Nenhum app ou marketplace encontrado. O mercado é informal (telefone/WhatsApp) ou contratado por licitação. | **Vazio.** |

### Nova tese: "Água Garantida", assinatura de continuidade de água para pequenos negócios
- **Cliente**: negócios que param sem água, como barbearias, salões, restaurantes, clínicas odontológicas, academias, lava-rápidos e pet shops.
- **Promessa**: "Seu negócio não fecha por falta d'água."
- **Como funciona**:
  1. **Previsão por regras simples** (sem IA no começo): cronograma de rodízio do SAAE, nível do Tietê (a ETA João Jabour para em cheia), onda de calor (+60% de consumo) e relatos dos próprios clientes.
  2. **Ação antes da falta**: quando há risco, agendamos o reabastecimento da caixa do cliente com caminhão-pipa parceiro **antes** de a água acabar.
  3. **SLA**: atendimento em até X horas. Assinatura mensal mais o custo da água.
- **Por que ninguém faz**: uma cidade de 141 mil habitantes não atrai empresas grandes, o SAAE não vende serviço e os pipeiros são informais. A barreira de entrada vem do **histórico de faltas por bairro** e da **rede de pipeiros** organizada.
- **Riscos**:
  - Água potável em caminhão-pipa exige veículo licenciado pela Vigilância Sanitária (Portaria GM/MS 888/2021), então o certo é trabalhar só com parceiros licenciados.
  - Se a nova ETA do Buru resolver a crise, a demanda cai. Por isso o produto precisa nascer replicável para Itu, Indaiatuba e cidades com SAAE municipal.

### Validação em 2 semanas
1. Mapear **todos os fornecedores de caminhão-pipa** de Salto, Itu e Indaiatuba: quantos são, se têm licença, preço por m³ e prazo em dia de crise.
2. Entrevistar **15 comerciantes** nos bairros com rodízio. Pergunta-chave: "Quanto você perdeu na última falta d'água?"
3. **Pré-vender 5 assinaturas**. Se ninguém pagar antecipado, a dor não é grande o suficiente e voltamos para a lista.

## Fontes
- [TVS+: Enchente interrompe abastecimento de água em bairros de Salto (16/10/2026)](https://www.tvsmais.com.br/enchente-interrompe-abastecimento-de-agua-em-bairros-de-salto/)
- [TVS+: Salto decreta estado de emergência hídrica](https://www.tvsmais.com.br/prefeitura-de-salto-decreta-estado-de-emergencia-hidrica/)
- [SAAE Salto: decreto e cronograma do rodízio](https://saaesalto.sp.gov.br/2025/12/31/municipio-decreta-emergencia-hidrica-e-rodizio-e-implantado-veja-cronograma/)
- [Jornal Cruzeiro: Salto terá rodízio; população reclama](https://www.jornalcruzeiro.com.br/sorocaba/regiao/2025/12/755635-salto-tera-rodizio-de-abastecimento-de-agua-populacao-reclama-de-situacao.html)
- [Jornal Periscópio: Salto mantém rodízio](https://jornalperiscopio.com.br/site/salto-mantem-rodizio-do-abastecimento-de-agua/)
- [Reclame Aqui: SAAE Salto](https://www.reclameaqui.com.br/empresa/saae-servico-autonomo-de-agua-esgoto-e-meio-ambiente-salto-sp/)
- [TVS+: Esgoto no Jd. São João](https://www.tvsmais.com.br/moradores-reclamam-de-mau-cheiro-e-vazamentos-na-rede-de-esgoto-em-salto/)
- [TVS+: Notícias de Salto (seção regional)](https://www.tvsmais.com.br/noticia-regional/salto/)
- [Gazeta SP: Espuma tóxica no Tietê em Salto](https://www.gazetasp.com.br/estado/espuma-toxica-cobre-trecho-do-rio-tiete-em-salto/)
- [Gazeta SP: Revitalização do Complexo da Cachoeira](https://www.gazetasp.com.br/turismo/salto-investe-r-12-milhao-na-revitalizacao-do-complexo-da-cachoeira/)
- [IBGE Cidades: Salto](https://www.ibge.gov.br/cidades-e-estados/sp/salto.html)
- [Prefeitura de Salto: canais do SAAE](https://salto.sp.gov.br/servicos/)
- [Agência Brasil: app de falta d'água (2015)](https://agenciabrasil.ebc.com.br/geral/noticia/2015-09/aplicativo-lancado-para-notificar-falta-dagua-tem-3-mil-acessos-em-cinco-dias)
- [Baguete: app mapeia falta de água em SP](https://www.baguete.com.br/noticias/app-mapeia-falta-de-agua-em-sao-paulo)
- [ND+: Comunica, Tubarão](https://ndmais.com.br/cidadania/comunica-tubarao-programa-no-whatsapp-alerta-sobre-interrupcoes-no-abastecimento-de-agua/)
- [Syny: monitoramento de reservatórios](https://syny.com.br/)
- [Olicon: monitoramento de caixa d'água](https://olicongestao.com.br/monitoramento-nivel-caixa-dagua)
