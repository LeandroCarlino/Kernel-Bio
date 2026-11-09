import { SpatialHash, queryBruteForce } from './spatial-hash.js';
import { BASE } from './config.js';

/**
 * Simulación pura: no conoce el DOM ni el canvas. Todo lo que necesita
 * entra por parámetros, incluido el generador aleatorio (para tests).
 */

/* ------------------------------------------------------------------ mundo */

export function crearMundo({ ancho, alto, config = {}, rnd = Math.random, celulas } = {}) {
  if (!(ancho > 0) || !(alto > 0)) throw new RangeError('ancho y alto deben ser positivos');

  const cfg = { ...BASE, ...config };
  const mundo = {
    ancho,
    alto,
    cfg,
    rnd,
    velocidad: 1,
    celulas: [],
    depredadores: [],
    nutrientes: null,
    cols: 0,
    filas: 0,
    hash: new SpatialHash(cfg.celdaHash),
    hashDepredadores: new SpatialHash(cfg.celdaHash),
    checks: 0,
    checksBrutos: 0,
    ultimoHash: 0,
    siguienteId: 1,
  };

  crearNutrientes(mundo, true);

  const iniciales = celulas ?? cfg.celulasIniciales;
  for (let i = 0; i < iniciales; i++) {
    mundo.celulas.push(crearCelula(mundo, rnd() * ancho, rnd() * alto));
  }

  if (cfg.depredadores) {
    for (let i = 0; i < cfg.depredadoresIniciales; i++) {
      mundo.depredadores.push(crearDepredador(mundo, rnd() * ancho, rnd() * alto));
    }
  }

  return mundo;
}

export function crearNutrientes(mundo, aleatorio = false) {
  const cols = Math.max(4, Math.round(mundo.ancho / mundo.cfg.celdaNutriente));
  const filas = Math.max(4, Math.round(mundo.alto / mundo.cfg.celdaNutriente));
  const datos = new Float32Array(cols * filas);

  for (let i = 0; i < datos.length; i++) {
    datos[i] = aleatorio ? mundo.rnd() * 0.75 : 0.35 + mundo.rnd() * 0.3;
  }

  mundo.nutrientes = datos;
  mundo.cols = cols;
  mundo.filas = filas;
}

export function crearCelula(mundo, x, y, energia, vx, vy) {
  const cfg = mundo.cfg;
  return {
    id: mundo.siguienteId++,
    tipo: 'celula',
    x,
    y,
    vx: vx ?? (mundo.rnd() - 0.5) * cfg.velocidadBase,
    vy: vy ?? (mundo.rnd() - 0.5) * cfg.velocidadBase,
    energia: energia ?? cfg.energiaInicial,
    radio: 2.4 + mundo.rnd() * 1.6,
    edad: 0,
  };
}

export function crearDepredador(mundo, x, y, energia) {
  return {
    id: mundo.siguienteId++,
    tipo: 'depredador',
    x,
    y,
    vx: 0,
    vy: 0,
    energia: energia ?? 1.8,
    radio: 4.2,
    edad: 0,
  };
}

/* -------------------------------------------------------------- nutrientes */

export function indiceNutriente(mundo, x, y) {
  const paso = mundo.cfg.celdaNutriente;
  const cx = Math.floor(x / paso);
  const cy = Math.floor(y / paso);
  if (cx < 0 || cy < 0 || cx >= mundo.cols || cy >= mundo.filas) return -1;
  return cy * mundo.cols + cx;
}

export function nutrientesEn(mundo, x, y) {
  const i = indiceNutriente(mundo, x, y);
  return i < 0 ? 0 : mundo.nutrientes[i];
}

/** Suma nutrientes en un disco de celdas alrededor de (x, y). */
export function sembrarNutrientes(mundo, x, y, celdas = 3, cantidad = 0.85) {
  const paso = mundo.cfg.celdaNutriente;
  let sembradas = 0;

  for (let dy = -celdas; dy <= celdas; dy++) {
    for (let dx = -celdas; dx <= celdas; dx++) {
      if (dx * dx + dy * dy > celdas * celdas) continue;
      const i = indiceNutriente(mundo, x + dx * paso, y + dy * paso);
      if (i < 0) continue;
      mundo.nutrientes[i] = Math.min(1, mundo.nutrientes[i] + cantidad);
      sembradas++;
    }
  }

  return sembradas;
}

function comer(mundo, indice, cantidad) {
  if (indice < 0) return 0;
  const disponible = mundo.nutrientes[indice];
  const tomado = Math.min(disponible, cantidad);
  mundo.nutrientes[indice] = disponible - tomado;
  return tomado;
}

function gradiente(mundo, x, y) {
  const paso = mundo.cfg.celdaNutriente;
  const izquierda = indiceNutriente(mundo, x - paso, y);
  const derecha = indiceNutriente(mundo, x + paso, y);
  const arriba = indiceNutriente(mundo, x, y - paso);
  const abajo = indiceNutriente(mundo, x, y + paso);

  const valor = (i) => (i >= 0 ? mundo.nutrientes[i] : 0);
  return {
    gx: valor(derecha) - valor(izquierda),
    gy: valor(abajo) - valor(arriba),
  };
}

function regenerar(mundo, dt) {
  const datos = mundo.nutrientes;
  const incremento = mundo.cfg.regeneracion * dt;
  for (let i = 0; i < datos.length; i++) {
    if (datos[i] < 1) datos[i] = Math.min(1, datos[i] + incremento);
  }
}

/* ---------------------------------------------------------------- simulación */

export function pasoMundo(mundo, dt, { fuerzaBruta = false } = {}) {
  const cfg = mundo.cfg;
  const { ancho, alto, rnd } = mundo;
  const celulas = mundo.celulas;
  const depredadores = mundo.depredadores;
  const hash = mundo.hash;
  const hashDep = mundo.hashDepredadores;
  const maxVelocidad = cfg.velocidadBase * mundo.velocidad;

  mundo.checksBrutos = 0;

  hash.clear();
  hashDep.clear();
  for (const celula of celulas) hash.insert(celula);
  for (const depredador of depredadores) hashDep.insert(depredador);

  const nacidas = [];
  const cazadas = new Set();

  for (const celula of celulas) {
    if (cazadas.has(celula.id)) continue;

    let vecinos;
    if (fuerzaBruta) {
      mundo.checksBrutos += celulas.length;
      vecinos = queryBruteForce(celulas, celula.x, celula.y, cfg.radioVecindad, (o) => o !== celula);
    } else {
      vecinos = hash.query(celula.x, celula.y, cfg.radioVecindad, (o) => o !== celula);
    }

    const amenazas = fuerzaBruta
      ? queryBruteForce(depredadores, celula.x, celula.y, cfg.radioHuir)
      : hashDep.query(celula.x, celula.y, cfg.radioHuir);
    if (fuerzaBruta) mundo.checksBrutos += depredadores.length;

    let ax = 0;
    let ay = 0;

    // Separación.
    for (const otra of vecinos) {
      const dx = celula.x - otra.x;
      const dy = celula.y - otra.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < cfg.radioSeparacion ** 2) {
        const d = Math.sqrt(d2);
        const fuerza = (1 - d / cfg.radioSeparacion) / d;
        ax += dx * fuerza;
        ay += dy * fuerza;
      }
    }

    // Cohesión suave.
    if (vecinos.length > 0) {
      let cx = 0;
      let cy = 0;
      for (const otra of vecinos) {
        cx += otra.x;
        cy += otra.y;
      }
      ax += (cx / vecinos.length - celula.x) * 0.012;
      ay += (cy / vecinos.length - celula.y) * 0.012;
    }

    // Huida de depredadores: pesa más que cualquier otra fuerza.
    for (const amenaza of amenazas) {
      const dx = celula.x - amenaza.x;
      const dy = celula.y - amenaza.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < cfg.radioHuir) {
        ax += (dx / d) * (1 - d / cfg.radioHuir) * 260;
        ay += (dy / d) * (1 - d / cfg.radioHuir) * 260;
      }
    }

    // Quimiotaxis.
    const { gx, gy } = gradiente(mundo, celula.x, celula.y);
    ax += gx * 220;
    ay += gy * 220;

    // Ruido vital.
    ax += (rnd() - 0.5) * 40;
    ay += (rnd() - 0.5) * 40;

    celula.vx += ax * dt;
    celula.vy += ay * dt;

    const rapidez = Math.hypot(celula.vx, celula.vy) || 1;
    if (rapidez > maxVelocidad) {
      celula.vx = (celula.vx / rapidez) * maxVelocidad;
      celula.vy = (celula.vy / rapidez) * maxVelocidad;
    }

    const dx = celula.vx * dt;
    const dy = celula.vy * dt;
    celula.x += dx;
    celula.y += dy;
    celula.edad += dt;

    if (celula.x < 3) { celula.x = 3; celula.vx = Math.abs(celula.vx); }
    if (celula.x > ancho - 3) { celula.x = ancho - 3; celula.vx = -Math.abs(celula.vx); }
    if (celula.y < 3) { celula.y = 3; celula.vy = Math.abs(celula.vy); }
    if (celula.y > alto - 3) { celula.y = alto - 3; celula.vy = -Math.abs(celula.vy); }

    celula.energia -= cfg.decaimiento * dt + Math.hypot(dx, dy) * cfg.costoPorPixel;

    const tomado = comer(mundo, indiceNutriente(mundo, celula.x, celula.y), dt * 0.9);
    if (tomado > 0) {
      celula.energia = Math.min(cfg.energiaMax, celula.energia + tomado * cfg.comida);
    }

    if (
      celula.energia >= cfg.energiaParaDividir &&
      celulas.length + nacidas.length < cfg.maxCelulas &&
      vecinos.length < 6
    ) {
      celula.energia /= 2;
      nacidas.push(
        crearCelula(
          mundo,
          celula.x + (rnd() - 0.5) * 6,
          celula.y + (rnd() - 0.5) * 6,
          celula.energia * 0.9,
          celula.vx * 0.8 + (rnd() - 0.5) * 20,
          celula.vy * 0.8 + (rnd() - 0.5) * 20,
        ),
      );
    }
  }

  // Depredadores: buscan la célula más cercana y la comen.
  const nuevosDepredadores = [];

  for (const depredador of depredadores) {
    let presas;
    if (fuerzaBruta) {
      mundo.checksBrutos += celulas.length;
      presas = queryBruteForce(celulas, depredador.x, depredador.y, cfg.radioCaza);
    } else {
      presas = hash.query(depredador.x, depredador.y, cfg.radioCaza);
    }

    let objetivo = null;
    let mejor = Infinity;
    for (const presa of presas) {
      if (cazadas.has(presa.id)) continue;
      const d = Math.hypot(presa.x - depredador.x, presa.y - depredador.y);
      if (d < mejor) {
        mejor = d;
        objetivo = presa;
      }
    }

    let ax = 0;
    let ay = 0;

    if (objetivo) {
      const dx = objetivo.x - depredador.x;
      const dy = objetivo.y - depredador.y;
      const d = Math.hypot(dx, dy) || 1;
      ax += (dx / d) * 180;
      ay += (dy / d) * 180;

      if (d < 11) {
        cazadas.add(objetivo.id);
        depredador.energia = Math.min(3.4, depredador.energia + 0.9);
      }
    } else {
      ax += (rnd() - 0.5) * 70;
      ay += (rnd() - 0.5) * 70;
    }

    depredador.vx += ax * dt;
    depredador.vy += ay * dt;

    const rapidez = Math.hypot(depredador.vx, depredador.vy) || 1;
    const tope = maxVelocidad * 0.85;
    if (rapidez > tope) {
      depredador.vx = (depredador.vx / rapidez) * tope;
      depredador.vy = (depredador.vy / rapidez) * tope;
    }

    const dx = depredador.vx * dt;
    const dy = depredador.vy * dt;
    depredador.x += dx;
    depredador.y += dy;
    depredador.edad += dt;

    if (depredador.x < 4) { depredador.x = 4; depredador.vx = Math.abs(depredador.vx); }
    if (depredador.x > ancho - 4) { depredador.x = ancho - 4; depredador.vx = -Math.abs(depredador.vx); }
    if (depredador.y < 4) { depredador.y = 4; depredador.vy = Math.abs(depredador.vy); }
    if (depredador.y > alto - 4) { depredador.y = alto - 4; depredador.vy = -Math.abs(depredador.vy); }

    depredador.energia -= (0.055 + Math.hypot(dx, dy) * 0.0006) * dt;

    if (
      depredador.energia > 2.6 &&
      depredadores.length + nuevosDepredadores.length < cfg.maxDepredadores
    ) {
      depredador.energia /= 2;
      nuevosDepredadores.push(crearDepredador(mundo, depredador.x, depredador.y, depredador.energia * 0.85));
    }
  }

  for (const nacida of nacidas) mundo.celulas.push(nacida);
  for (const nuevo of nuevosDepredadores) mundo.depredadores.push(nuevo);

  mundo.celulas = mundo.celulas.filter((c) => c.energia > 0 && !cazadas.has(c.id));
  mundo.depredadores = mundo.depredadores.filter((d) => d.energia > 0);

  if (fuerzaBruta) {
    mundo.checks = mundo.checksBrutos;
  } else {
    mundo.checks = hash.tests + hashDep.tests;
    mundo.ultimoHash = mundo.checks;
  }

  regenerar(mundo, dt);

  return {
    checks: mundo.checks,
    celulas: mundo.celulas.length,
    depredadores: mundo.depredadores.length,
    cazadas: cazadas.size,
  };
}

/* --------------------------------------------------------------- inspector */

/**
 * Simula la consulta de una célula en (x, y) sin alterar las métricas del
 * frame: devuelve vecinas, distancias evaluadas y celdas visitadas.
 */
export function inspeccionarConsulta(mundo, x, y, radio = mundo.cfg.radioVecindad) {
  const hash = mundo.hash;
  const antes = hash.tests;
  const vecinos = hash.query(x, y, radio);
  const evaluadas = hash.tests - antes;
  hash.tests = antes;

  const { cellSize } = hash;
  const minX = Math.floor((x - radio) / cellSize);
  const maxX = Math.floor((x + radio) / cellSize);
  const minY = Math.floor((y - radio) / cellSize);
  const maxY = Math.floor((y + radio) / cellSize);

  const celdas = [];
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const clave = `${cx},${cy}`;
      const bucket = hash.buckets.get(clave);
      if (bucket && bucket.length) celdas.push({ cx, cy, cantidad: bucket.length });
    }
  }

  return { vecinos, evaluadas, celdas, radio };
}
