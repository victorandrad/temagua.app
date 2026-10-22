-- Esquema do banco do Tem Água?. Idempotente: a API aplica este arquivo a cada inicialização.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS relatos (
  id         text PRIMARY KEY,
  status     text NOT NULL CHECK (status IN ('sem-agua', 'voltou')),
  bairro     text NOT NULL,
  -- Posição pública (já arredondada para ~11 m pelo app e pela API).
  lng        double precision NOT NULL,
  lat        double precision NOT NULL,
  -- 'app' = relato feito no app (único valor hoje; a coluna fica para outras fontes no futuro).
  origem     text NOT NULL DEFAULT 'app' CHECK (origem IN ('app')),
  criado_em  timestamptz NOT NULL DEFAULT now(),

  -- Colunas derivadas para relatórios: ponto geográfico e dia/hora no fuso de Salto.
  geom       geography(Point, 4326)
             GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  dia        date
             GENERATED ALWAYS AS ((criado_em AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  hora       smallint
             GENERATED ALWAYS AS (extract(hour FROM criado_em AT TIME ZONE 'America/Sao_Paulo')::smallint) STORED
);

CREATE INDEX IF NOT EXISTS relatos_dia_hora_idx  ON relatos (dia, hora);
CREATE INDEX IF NOT EXISTS relatos_criado_em_idx ON relatos (criado_em DESC);
CREATE INDEX IF NOT EXISTS relatos_bairro_idx    ON relatos (bairro, criado_em DESC);
CREATE INDEX IF NOT EXISTS relatos_geom_idx      ON relatos USING gist (geom);

-- ---- Um relato ativo por aparelho ----
-- aparelho: HMAC do UUID que o app gera na primeira visita (nunca o UUID em si, nunca sai na API).
--           Apagado depois de 30 dias (o relato continua, anônimo, nas métricas).
-- confirmado_em: o mesmo aparelho relatou de novo o mesmo status → renova o prazo no mapa.
-- encerrado_em: o mesmo aparelho relatou o status oposto (ex.: a água voltou) → sai do mapa.
ALTER TABLE relatos ADD COLUMN IF NOT EXISTS aparelho      text;
ALTER TABLE relatos ADD COLUMN IF NOT EXISTS confirmado_em timestamptz;
ALTER TABLE relatos ADD COLUMN IF NOT EXISTS encerrado_em  timestamptz;
CREATE INDEX IF NOT EXISTS relatos_aparelho_idx ON relatos (aparelho, criado_em DESC) WHERE aparelho IS NOT NULL;

-- Segredo do HMAC do aparelho (gerado pela API na primeira subida; APARELHO_SEGREDO tem precedência).
CREATE TABLE IF NOT EXISTS configuracao (
  chave text PRIMARY KEY,
  valor text NOT NULL
);

-- ---- Setores de abastecimento (mapa "Regiões x Reservatórios") ----
-- Recarregada pela API a cada subida a partir de packages/contracts/src/abastecimento.json.
CREATE TABLE IF NOT EXISTS areas_abastecimento (
  setor_id text NOT NULL,
  setor    text NOT NULL,
  area     text NOT NULL,
  geom     geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS areas_abastecimento_geom_idx ON areas_abastecimento USING gist (geom);

-- ---- Sem dados de demonstração ----
-- O projeto teve relatos fictícios (origem = 'demo'); apaga os que sobraram em bancos antigos e
-- deixa a coluna aceitar só 'app'.
DELETE FROM relatos WHERE origem <> 'app';
ALTER TABLE relatos DROP CONSTRAINT IF EXISTS relatos_origem_check;
ALTER TABLE relatos ADD CONSTRAINT relatos_origem_check CHECK (origem IN ('app'));
