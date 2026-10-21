-- Esquema do banco do Tem Água?. Idempotente: a API aplica este arquivo a cada inicialização.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS relatos (
  id         text PRIMARY KEY,
  status     text NOT NULL CHECK (status IN ('sem-agua', 'voltou')),
  bairro     text NOT NULL,
  -- Posição pública (já arredondada para ~11 m pelo app e pela API).
  lng        double precision NOT NULL,
  lat        double precision NOT NULL,
  -- 'app' = relato real; 'demo' = dados de demonstração (npm run db:seed).
  origem     text NOT NULL DEFAULT 'app' CHECK (origem IN ('app', 'demo')),
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
