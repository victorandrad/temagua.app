import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { AttributionControl, Map as MlMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, Point } from 'geojson';
import {
  adicionarCamadaAbastecimento,
  destacarSetor,
  enquadrarSetores,
  filtrarSetores,
  mostrarAbastecimento,
} from './abastecimento';
import {
  abastecimentoProximo,
  emit,
  frescor,
  last,
  nearestBairro,
  on,
  relatoAtivo,
  SALTO_BOUNDS,
  SALTO_CENTER,
  type MapPadding,
  type Report,
} from '@tem-agua/contracts';

// Por padrão o MapLibre procura o worker ao lado do próprio módulo, que aqui foi empacotado
// dentro do chunk do remoto. Apontamos para o arquivo publicado como asset (URL absoluta do remoto).
setWorkerUrl(new URL(workerUrl, import.meta.url).href);

// Estilo cinza claro, sem chave de API e com uso comercial liberado (OpenFreeMap).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const NO_PADDING: MapPadding = { top: 0, bottom: 0, left: 0, right: 0 };

// Mesma curva no CSS do pin e na animação do mapa, para os dois andarem juntos.
const SNAP_MS = 450;
const SNAP_CSS_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'; // ease-out cubic
const snapEasing = (t: number) => 1 - Math.pow(1 - t, 3);

const GEO_ERRORS: Record<number, string> = {
  1: 'Permissão de localização negada. Libere nas configurações do navegador.',
  2: 'Não conseguimos achar sua posição. Verifique se o GPS está ligado.',
  3: 'O GPS demorou para responder. Tente de novo, de preferência perto de uma janela.',
};

/** Metros por pixel no zoom 0 (MapLibre usa tiles de 512 px). */
const METERS_PER_PX_Z0 = 78271.484;

function meGeoJSON(lng: number, lat: number, accuracy: number): FeatureCollection<Point> {
  // O círculo de precisão é em metros; convertemos para pixels nos zooms 0 e 22 e o MapLibre interpola.
  const r0 = accuracy / (METERS_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180));
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { r0, r22: r0 * 2 ** 22 } }],
  };
}

function toGeoJSON(reports: Report[]): FeatureCollection<Point> {
  const now = Date.now();
  return {
    type: 'FeatureCollection',
    features: reports
      // 12 h desde a última confirmação; encerrados (quem avisou disse o contrário depois) saem.
      .filter((r) => relatoAtivo(r, now))
      .map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
        // Relatos mais recentes pesam mais no mapa de calor e ficam mais opacos (meia-vida de 3 h).
        properties: { status: r.status, freshness: Math.max(0.15, frescor(r, now)) },
      })),
  };
}

export function MapaApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [moving, setMoving] = useState(false);
  const [bairro, setBairro] = useState('');
  const [padding, setPadding] = useState<MapPadding>(NO_PADDING);
  const [locating, setLocating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, snapping: false });
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const locateRef = useRef<() => void>(() => {});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const map = new MlMap({
      container: containerRef.current!,
      style: STYLE_URL,
      center: [SALTO_CENTER.lng, SALTO_CENTER.lat],
      zoom: 13.5,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: [
        [SALTO_BOUNDS[0], SALTO_BOUNDS[1]],
        [SALTO_BOUNDS[2], SALTO_BOUNDS[3]],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), 'top-right');
    mapRef.current = map;

    const publishCenter = () => {
      const c = map.getCenter();
      const b = nearestBairro(c.lng, c.lat);
      const abast = abastecimentoProximo(c.lng, c.lat);
      setBairro(b.nome);
      destacarSetor(map, abast?.setor.id ?? null);
      emit('center', { lng: c.lng, lat: c.lat, bairro: b.nome, setor: abast?.setor.id ?? null, area: abast?.area.nome ?? null, distanciaArea: abast ? Math.round(abast.distancia) : null });
    };

    map.on('movestart', () => setMoving(true));
    map.on('moveend', () => {
      setMoving(false);
      publishCenter();
    });

    const offs: Array<() => void> = [];

    map.on('load', () => {
      // A atribuição compacta abre expandida e cobre o topo no celular; começa recolhida (botão ⓘ).
      containerRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');

      map.addSource('reports', { type: 'geojson', data: toGeoJSON([]) });

      map.addLayer({
        id: 'reports-heat',
        type: 'heatmap',
        source: 'reports',
        maxzoom: 15,
        filter: ['==', ['get', 'status'], 'sem-agua'],
        paint: {
          'heatmap-weight': ['get', 'freshness'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.4],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 15, 42],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(225, 25, 0, 0)',
            0.2, 'rgba(255, 150, 130, 0.35)',
            0.5, 'rgba(240, 80, 50, 0.55)',
            1, 'rgba(200, 20, 0, 0.75)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 1, 15, 0],
        },
      });

      map.addLayer({
        id: 'reports-dot',
        type: 'circle',
        source: 'reports',
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 7],
          'circle-color': ['match', ['get', 'status'], 'sem-agua', '#E11900', '#05A357'],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, ['max', 0.4, ['get', 'freshness']]],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
        },
      });

      // Camada opcional de reservatórios, por baixo dos relatos (ligada pelo selo do shell ou pelo painel).
      adicionarCamadaAbastecimento(map, 'reports-heat');
      let replay = true;
      offs.push(
        on('camadas', (c) => {
          mostrarAbastecimento(map, c.abastecimento);
          filtrarSetores(map, c.setores ?? null);
          // Só enquadra quando a pessoa muda a seleção, não no valor repetido ao montar o mapa.
          // "Todos" (null) enquadra a cidade inteira; "Nenhum" ([]) não mexe no mapa.
          if (!replay && c.enquadrar && c.abastecimento && c.setores?.length !== 0) enquadrarSetores(map, c.setores ?? null);
        }),
      );
      replay = false;
      map.on('click', 'abast-estrutura', (e) => {
        const p = e.features?.[0]?.properties;
        if (p) showToast(`${p.nome} · ${p.tipoNome} do setor ${p.setorNome}`);
      });
      map.on('mouseenter', 'abast-estrutura', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'abast-estrutura', () => (map.getCanvas().style.cursor = ''));

      // Ponto azul da localização do GPS, com o círculo de precisão.
      map.addSource('me', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'me-accuracy',
        type: 'circle',
        source: 'me',
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, ['get', 'r0'], 22, ['get', 'r22']],
          'circle-color': '#276EF1',
          'circle-opacity': 0.12,
          'circle-stroke-color': '#276EF1',
          'circle-stroke-opacity': 0.35,
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'me-dot',
        type: 'circle',
        source: 'me',
        paint: {
          'circle-radius': 7,
          'circle-color': '#276EF1',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });

      const desenhar = (reports: Report[]) => (map.getSource('reports') as GeoJSONSource).setData(toGeoJSON(reports));
      offs.push(on('reports', desenhar));
      // Sem relatos novos o mapa também muda: os antigos perdem peso e expiram com o tempo.
      const relogio = setInterval(() => {
        const atuais = last('reports');
        if (atuais) desenhar(atuais);
      }, 60_000);
      offs.push(() => clearInterval(relogio));
      publishCenter();
      // Primeiro quadro completo do mapa: o shell fecha a splash screen.
      map.once('idle', () => emit('map-ready', null));
    });

    offs.push(
      on('fly-to', ({ lng, lat, zoom }) => map.flyTo({ center: [lng, lat], zoom: zoom ?? 15.5, duration: 900, essential: true })),
    );
    // "Sua localização" na busca do shell. Sem replay: um pedido antigo não pode disparar o GPS ao montar.
    offs.push(on('locate', () => locateRef.current(), { replay: false }));
    offs.push(
      on('map-padding', (p) => {
        setPadding(p);
        // O padding faz o "centro" do mapa (e o pin) ficar na área que o layout do shell deixa visível.
        map.easeTo({ padding: p, duration: 250 });
      }),
    );

    return () => {
      clearTimeout(toastTimer.current);
      offs.forEach((off) => off());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const locate = () => {
    // O navegador só libera o GPS em HTTPS (ou localhost).
    if (!window.isSecureContext || !navigator.geolocation) {
      showToast('A localização só funciona pelo link seguro (https).');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { longitude: lng, latitude: lat, accuracy } = pos.coords;
        const [west, south, east, north] = SALTO_BOUNDS;
        if (lng < west || lng > east || lat < south || lat > north) {
          showToast('Você está fora de Salto. Arraste o mapa até o local da falta d’água.');
          return;
        }
        (mapRef.current?.getSource('me') as GeoJSONSource | undefined)?.setData(meGeoJSON(lng, lat, accuracy));
        mapRef.current?.flyTo({ center: [lng, lat], zoom: accuracy > 150 ? 15 : 17, essential: true });
        if (accuracy > 50) showToast(`Localização aproximada (±${Math.round(accuracy)} m). Arraste o pin para ajustar.`);
        else setToast(null);
      },
      (err) => {
        setLocating(false);
        showToast(GEO_ERRORS[err.code] ?? 'Não foi possível obter sua localização.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  locateRef.current = locate;

  // ---- Arrastar o próprio pin ----
  // Ao soltar, o mapa desliza até o ponto onde o pin caiu e o pin volta ao centro na mesma
  // animação. Assim a posição escolhida continua sendo sempre o centro do mapa.
  const onPinPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0, snapping: false });
    setDragging(true);
  };

  const onPinPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    setDrag({ dx: e.clientX - start.x, dy: e.clientY - start.y, snapping: false });
  };

  const onPinPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    dragStart.current = null;
    setDragging(false);
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < 4) {
      setDrag({ dx: 0, dy: 0, snapping: false });
      return;
    }
    // Liga a transição e força o navegador a aplicá-la antes de zerar o deslocamento,
    // senão o pin pula direto para o centro em vez de deslizar junto com o mapa.
    flushSync(() => setDrag({ dx, dy, snapping: true }));
    dragRef.current?.getBoundingClientRect();
    setDrag({ dx: 0, dy: 0, snapping: true });
    mapRef.current?.panBy([dx, dy], { duration: SNAP_MS, easing: snapEasing });
  };

  const pinTop = `calc(${padding.top}px + (100% - ${padding.top + padding.bottom}px) / 2)`;
  const pinLeft = `calc(${padding.left}px + (100% - ${padding.left + padding.right}px) / 2)`;
  const lifted = moving || dragging;

  return (
    <div className="ta-mapa">
      <div ref={containerRef} className="ta-mapa__canvas" />

      <div className={`ta-pin${lifted ? ' is-moving' : ''}`} style={{ top: pinTop, left: pinLeft }}>
        <div
          ref={dragRef}
          className="ta-pin__drag"
          style={{
            transform: `translate(${drag.dx}px, ${drag.dy}px)`,
            transition: drag.snapping ? `transform ${SNAP_MS}ms ${SNAP_CSS_EASING}` : 'none',
          }}
        >
          <div className="ta-pin__bubble" aria-hidden="true">
            <span className="ta-pin__bubble-label">Sua localização</span>
            <span className="ta-pin__bubble-name">{bairro || 'Salto'}</span>
          </div>
          <div className="ta-pin__body" aria-hidden="true">
            <div className="ta-pin__head" />
            <div className="ta-pin__stick" />
          </div>
          <div className="ta-pin__shadow" aria-hidden="true" />
          <div
            className="ta-pin__grab"
            role="img"
            aria-label="Pin da sua localização. Arraste o pin ou o mapa para ajustar."
            onPointerDown={onPinPointerDown}
            onPointerMove={onPinPointerMove}
            onPointerUp={onPinPointerUp}
            onPointerCancel={onPinPointerUp}
            onTransitionEnd={() => setDrag((d) => (d.dx === 0 && d.dy === 0 ? { ...d, snapping: false } : d))}
          />
        </div>
      </div>

      {toast && (
        <div className="ta-toast" role="status" style={{ top: padding.top + 12, left: pinLeft }}>
          {toast}
        </div>
      )}

      <button
        type="button"
        className={`ta-locate${locating ? ' is-locating' : ''}`}
        style={{ bottom: padding.bottom + 16 }}
        onClick={locate}
        aria-label="Ir para minha localização"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M21 3 3 10.5l7.2 2.3L12.5 20z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
