/** Parámetros por defecto y escenarios predefinidos. */

export const BASE = {
  maxCelulas: 700,
  maxDepredadores: 40,
  radioVecindad: 36,
  radioSeparacion: 16,
  radioHuir: 64,
  radioCaza: 90,
  velocidadBase: 46,
  celdaHash: 48,
  celdaNutriente: 26,
  decaimiento: 0.045,
  costoPorPixel: 0.0009,
  energiaMax: 2.6,
  energiaParaDividir: 1.9,
  energiaInicial: 1.1,
  comida: 1.6,
  regeneracion: 0.03,
  depredadores: false,
  depredadoresIniciales: 0,
  celulasIniciales: 180,
};

export const PRESETS = {
  colonias: {
    etiqueta: 'Colonias',
    descripcion: 'Equilibrio: nutrientes normales y células que forman colonias.',
    regeneracion: 0.03,
    decaimiento: 0.045,
    depredadores: false,
    celulasIniciales: 180,
  },
  escasez: {
    etiqueta: 'Escasez',
    descripcion: 'Casi no hay comida: sobreviven las que encuentran los restos.',
    regeneracion: 0.007,
    decaimiento: 0.06,
    depredadores: false,
    celulasIniciales: 220,
  },
  plaga: {
    etiqueta: 'Plaga',
    descripcion: 'Comida abundante y metabolismo barato: la población explota.',
    regeneracion: 0.07,
    decaimiento: 0.025,
    depredadores: false,
    celulasIniciales: 260,
  },
  caza: {
    etiqueta: 'Caza',
    descripcion: 'Depredadores que persiguen células. Sin presas, se mueren.',
    regeneracion: 0.045,
    decaimiento: 0.04,
    depredadores: true,
    celulasIniciales: 300,
    depredadoresIniciales: 6,
  },
};

export const PRESET_POR_DEFECTO = 'colonias';

/**
 * Lee la configuración de la URL: `?preset=caza&n=420&bruta=1`.
 * Devuelve un preset válido y la cantidad inicial de células.
 */
export function leerUrl(busqueda = window.location.search) {
  const params = new URLSearchParams(busqueda);
  const preset = PRESETS[params.get('preset')] ? params.get('preset') : PRESET_POR_DEFECTO;
  const n = Number.parseInt(params.get('n') ?? '', 10);
  const bruta = params.get('bruta') === '1';
  const grilla = params.get('grilla') === '1';

  return {
    preset,
    celulas: Number.isFinite(n) ? Math.min(Math.max(n, 10), BASE.maxCelulas) : null,
    bruta,
    grilla,
  };
}

/** Escribe el escenario en la URL sin recargar, para poder compartirlo. */
export function escribirUrl({ preset, celulas, bruta, grilla }) {
  try {
    const params = new URLSearchParams();
    if (preset) params.set('preset', preset);
    if (Number.isFinite(celulas)) params.set('n', String(celulas));
    if (bruta) params.set('bruta', '1');
    if (grilla) params.set('grilla', '1');

    const consulta = params.toString();
    const url = `${window.location.pathname}${consulta ? `?${consulta}` : ''}`;
    window.history.replaceState(null, '', url);
  } catch {
    /* sin historial disponible: no es crítico */
  }
}
