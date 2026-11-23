import { useEffect, useState } from 'react';
import { DEFAULT_CITY, nearestCity, parseCityMap, type CityIndexEntry, type CityMap, type CityMapFile } from '../../lib/city/map';
import { parseTransit, withTransit, type TransitFile } from '../../lib/city/transit';
import VacancyMatchingLab from './VacancyMatchingLab';

const STORAGE_KEY = 'nexus:vagas-cidade';
const MODE_KEY = 'nexus:vagas-deslocamento';
export type TravelMode = 'car' | 'transit';

type Locate =
  | { status: 'idle' | 'asking' }
  | { status: 'found'; km: number; name: string }
  | { status: 'error'; message: string };

const loaded = new Map<string, Promise<CityMap>>();
function loadCity(id: string): Promise<CityMap> {
  let p = loaded.get(id);
  if (!p) {
    p = fetch(`/maps/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CityMapFile>;
    }).then(parseCityMap);
    p.catch(() => loaded.delete(id));
    loaded.set(id, p);
  }
  return p;
}

const loadedTransit = new Map<string, Promise<CityMap>>();
/** Mesma cidade com as linhas de transporte público (arquivo à parte, só baixado quando escolhido). */
function loadTransitCity(id: string): Promise<CityMap> {
  let p = loadedTransit.get(id);
  if (!p) {
    p = Promise.all([
      loadCity(id),
      fetch(`/maps/${id}.transit.json`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TransitFile>;
      }),
    ]).then(([base, file]) => withTransit(base, parseTransit(file)));
    p.catch(() => loadedTransit.delete(id));
    loadedTransit.set(id, p);
  }
  return p;
}

/**
 * Vagas e Candidatos sobre o mapa real de uma cidade (ruas do OpenStreetMap, embutidas no site).
 * A localização de quem visita só é usada aqui, para escolher a cidade com mapa mais próxima;
 * não é enviada a lugar nenhum nem guardada (só a cidade escolhida fica no navegador).
 */
export default function VacancyMatching({ level = 'h3' }: { level?: 'h2' | 'h3' }) {
  const [cities, setCities] = useState<CityIndexEntry[]>([]);
  const [cityId, setCityId] = useState<string | null>(null);
  const [city, setCity] = useState<CityMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locate, setLocate] = useState<Locate>({ status: 'idle' });
  // Padrão: transporte público, o caso mais comum para estágio e primeiro emprego.
  const [mode, setMode] = useState<TravelMode>('transit');
  const entry = cities.find((c) => c.id === cityId);
  const hasTransit = entry?.transit ?? false;
  const effectiveMode: TravelMode = hasTransit ? mode : 'car';

  useEffect(() => {
    fetch('/maps/index.json')
      .then((r) => r.json() as Promise<{ cities: CityIndexEntry[] }>)
      .then((idx) => {
        setCities(idx.cities);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
        } catch {}
        try {
          const m = localStorage.getItem(MODE_KEY);
          if (m === 'car' || m === 'transit') setMode(m);
        } catch {}
        const ids = idx.cities.map((c) => c.id);
        setCityId(saved && ids.includes(saved) ? saved : ids.includes(DEFAULT_CITY) ? DEFAULT_CITY : ids[0]);
      })
      .catch(() => setError('Não foi possível carregar a lista de cidades.'));
  }, []);

  useEffect(() => {
    if (!cityId || cities.length === 0) return;
    let live = true;
    setError(null);
    (effectiveMode === 'transit' ? loadTransitCity(cityId) : loadCity(cityId))
      .then((c) => live && setCity(c))
      .catch(() => live && setError('Não foi possível carregar o mapa desta cidade.'));
    try {
      localStorage.setItem(STORAGE_KEY, cityId);
      localStorage.setItem(MODE_KEY, mode);
    } catch {}
    return () => {
      live = false;
    };
  }, [cityId, effectiveMode, cities.length, mode]);

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setLocate({ status: 'error', message: 'Este navegador não informa a localização. Escolha a cidade na lista.' });
      return;
    }
    setLocate({ status: 'asking' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { city: near, km } = nearestCity(cities, { lat: pos.coords.latitude, lon: pos.coords.longitude });
        setCityId(near.id);
        setLocate({ status: 'found', km, name: near.name });
      },
      (err) =>
        setLocate({
          status: 'error',
          message: err.code === err.PERMISSION_DENIED ? 'Permissão negada. Escolha a cidade na lista.' : 'Não foi possível obter a localização. Escolha a cidade na lista.',
        }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  const loading = !city || city.id !== cityId;
  const switching = !!city && !loading && (effectiveMode === 'transit') !== ('lines' in city);
  return (
    <div className="vm-city">
      <div className="vm-city-bar">
        <label>
          <span className="eyebrow">Cidade</span>
          <select value={cityId ?? ''} onChange={(e) => setCityId(e.target.value)} disabled={cities.length === 0}>
            {cities.length === 0 && <option value="">carregando…</option>}
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.uf}
              </option>
            ))}
          </select>
        </label>
        <div className="vm-mode" role="radiogroup" aria-label="Deslocamento">
          <span className="eyebrow">Deslocamento</span>
          <div>
            {(
              [
                ['transit', 'Transporte público'],
                ['car', 'Carro'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={effectiveMode === k}
                disabled={k === 'transit' && !hasTransit}
                title={
                  k === 'transit'
                    ? hasTransit
                      ? `${entry?.transitLines} trechos de linha mapeados no OpenStreetMap`
                      : `O OpenStreetMap tem só ${entry?.transitLines ?? 0} trechos de linha nesta cidade: poucos para estimar o transporte público`
                    : undefined
                }
                onClick={() => setMode(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="button quiet" onClick={locateMe} disabled={cities.length === 0 || locate.status === 'asking'}>
          {locate.status === 'asking' ? 'Localizando…' : 'Usar minha região'}
        </button>
        <p className="muted small" role="status">
          {locate.status === 'found'
            ? `Mapa mais próximo de você: ${locate.name}, a ${Math.round(locate.km)} km. `
            : locate.status === 'error'
              ? `${locate.message} `
              : ''}
          Sua localização é comparada só no navegador e não é enviada.
        </p>
      </div>
      {error && <p className="vm-city-error">{error}</p>}
      {loading && !error && (
        <div className="vm-city-loading card" aria-busy="true">
          Carregando o mapa {cityId ? `de ${cities.find((c) => c.id === cityId)?.name ?? ''}` : ''}…
        </div>
      )}
      {switching && <p className="muted small" role="status">Montando a rede de {effectiveMode === 'transit' ? 'transporte público' : 'ruas'}…</p>}
      {city && !loading && <VacancyMatchingLab key={city.id} city={city} level={level} />}
    </div>
  );
}
