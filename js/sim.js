import { PRESETS, PRESET_POR_DEFECTO, leerUrl, escribirUrl } from './config.js';
import {
  crearMundo,
  crearCelula,
  pasoMundo,
  sembrarNutrientes,
  inspeccionarConsulta,
} from './mundo.js';

const TAU = Math.PI * 2;


const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d', { alpha: false });
const pista = document.getElementById('pista');
const grafico = document.getElementById('grafico');
const ctxGrafico = grafico.getContext('2d');
const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  celulas: document.getElementById('m-celulas'),
  depredadores: document.getElementById('m-depredadores'),
  fps: document.getElementById('m-fps'),
  celdas: document.getElementById('m-celdas'),
  checks: document.getElementById('m-checks'),
  modo: document.getElementById('m-modo'),
  ahorro: document.getElementById('m-ahorro'),
  pausa: document.getElementById('btn-pausa'),
  reiniciar: document.getElementById('btn-reiniciar'),
  agregar: document.getElementById('btn-agregar'),
  nutrientes: document.getElementById('btn-nutrientes'),
  grilla: document.getElementById('btn-grilla'),
  bruta: document.getElementById('btn-bruta'),
  velocidad: document.getElementById('velocidad'),
  velocidadValor: document.getElementById('velocidad-valor'),
  preset: document.getElementById('preset'),
  inspector: document.getElementById('inspector'),
  inspectorDatos: document.getElementById('inspector-datos'),
  iCeldas: document.getElementById('i-celdas'),
  iDistancias: document.getElementById('i-distancias'),
  iVecinas: document.getElementById('i-vecinas'),
  seleccion: document.getElementById('seleccion'),
  factor: document.getElementById('grafico-factor'),
};

const opciones = leerUrl();

const estado = {
  corriendo: true,
  velocidad: 1,
  mostrarGrilla: opciones.grilla,
  mostrarNutrientes: true,
  fuerzaBruta: opciones.bruta,
  preset: opciones.preset,
  seleccionada: null,
  cursor: null,
  inspeccion: null,
  fps: 60,
  muestras: [],
};

let ancho = 0;
let alto = 0;
let dpr = 1;
let mundo = null;
let ultimoTiempo = 0;
let frames = 0;
let acumulador = 0;
let acumuladorInspector = 0;
let pistaOculta = false;

const capaNutrientes = document.createElement('canvas');
const ctxNutrientes = capaNutrientes.getContext('2d');

/* ------------------------------------------------------------------ mundo */

function ajustarLienzo() {
  const rect = lienzo.getBoundingClientRect();
  ancho = Math.max(1, Math.round(rect.width));
  alto = Math.max(1, Math.round(rect.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#030805';
  ctx.fillRect(0, 0, ancho, alto);
}

function crearMundoActual(usarUrl = false) {
  const preset = PRESETS[estado.preset] ?? PRESETS[PRESET_POR_DEFECTO];
  const cantidad = usarUrl ? (opciones.celulas ?? preset.celulasIniciales) : preset.celulasIniciales;
  mundo = crearMundo({
    ancho,
    alto,
    config: preset,
    celulas: cantidad,
  });

  capaNutrientes.width = mundo.cols;
  capaNutrientes.height = mundo.filas;
  estado.muestras = [];
  estado.seleccionada = null;
  estado.inspeccion = null;
}

function redimensionarMundo() {
  if (!mundo) return;
  mundo.ancho = ancho;
  mundo.alto = alto;
  for (const entidad of [...mundo.celulas, ...mundo.depredadores]) {
    entidad.x = Math.min(Math.max(entidad.x, 4), ancho - 4);
    entidad.y = Math.min(Math.max(entidad.y, 4), alto - 4);
  }
  capaNutrientes.width = mundo.cols;
  capaNutrientes.height = mundo.filas;
}

function cambiarPreset(nombre) {
  estado.preset = PRESETS[nombre] ? nombre : PRESET_POR_DEFECTO;
  ui.preset.value = estado.preset;
  crearMundoActual();
  sincronizarUrl();
  actualizarPanel();
}

/* ---------------------------------------------------------------- dibujado */

function dibujarNutrientes() {
  const { cols, filas, nutrientes } = mundo;
  const imagen = ctxNutrientes.createImageData(cols, filas);

  for (let i = 0; i < nutrientes.length; i++) {
    const valor = nutrientes[i];
    const base = i * 4;
    imagen.data[base] = 10;
    imagen.data[base + 1] = 90 + Math.round(valor * 120);
    imagen.data[base + 2] = 40 + Math.round(valor * 40);
    imagen.data[base + 3] = Math.round(valor * 90);
  }

  ctxNutrientes.putImageData(imagen, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(capaNutrientes, 0, 0, ancho, alto);
  ctx.globalAlpha = 1;
}

function dibujarGrilla() {
  ctx.strokeStyle = 'rgba(68, 255, 136, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= ancho; x += mundo.cfg.celdaHash) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, alto);
  }
  for (let y = 0; y <= alto; y += mundo.cfg.celdaHash) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(ancho, y + 0.5);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(68, 255, 136, 0.05)';
  for (const [clave] of mundo.hash.buckets) {
    const [cx, cy] = clave.split(',').map(Number);
    ctx.fillRect(
      cx * mundo.cfg.celdaHash,
      cy * mundo.cfg.celdaHash,
      mundo.cfg.celdaHash,
      mundo.cfg.celdaHash,
    );
  }
}

function dibujarInspector() {
  if (!estado.inspeccion) return;
  const { radio, celdas, vecinos } = estado.inspeccion;
  const paso = mundo.cfg.celdaHash;

  ctx.fillStyle = 'rgba(120, 200, 255, 0.10)';
  for (const celda of celdas) {
    ctx.fillRect(celda.cx * paso, celda.cy * paso, paso, paso);
  }

  ctx.strokeStyle = 'rgba(120, 200, 255, 0.75)';
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(estado.inspeccion.x, estado.inspeccion.y, radio, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)';
  ctx.beginPath();
  for (const vecino of vecinos) {
    ctx.moveTo(estado.inspeccion.x, estado.inspeccion.y);
    ctx.lineTo(vecino.x, vecino.y);
  }
  ctx.stroke();

  ctx.fillStyle = '#b9e6ff';
  ctx.beginPath();
  ctx.arc(estado.inspeccion.x, estado.inspeccion.y, 2.5, 0, TAU);
  ctx.fill();
}

function dibujarCelulas() {
  for (const celula of mundo.celulas) {
    const energia = Math.min(1, celula.energia / mundo.cfg.energiaMax);

    if (!reducirMovimiento) {
      ctx.fillStyle = 'rgba(68, 255, 136, 0.07)';
      ctx.beginPath();
      ctx.arc(celula.x, celula.y, celula.radio * 3.4, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = `rgba(68, 255, 136, ${0.35 + energia * 0.6})`;
    ctx.beginPath();
    ctx.arc(celula.x, celula.y, celula.radio, 0, TAU);
    ctx.fill();

    ctx.fillStyle = `rgba(220, 255, 235, ${0.25 + energia * 0.5})`;
    ctx.beginPath();
    ctx.arc(celula.x - celula.radio * 0.3, celula.y - celula.radio * 0.3, celula.radio * 0.35, 0, TAU);
    ctx.fill();

    if (estado.seleccionada === celula.id) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(celula.x, celula.y, celula.radio + 7, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
}

function dibujarDepredadores() {
  for (const depredador of mundo.depredadores) {
    const angulo = Math.atan2(depredador.vy, depredador.vx);
    ctx.save();
    ctx.translate(depredador.x, depredador.y);
    ctx.rotate(angulo);

    ctx.fillStyle = 'rgba(255, 107, 107, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, depredador.radio * 4, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function dibujar() {
  ctx.fillStyle = reducirMovimiento ? '#030805' : 'rgba(3, 8, 5, 0.22)';
  ctx.fillRect(0, 0, ancho, alto);

  if (estado.mostrarNutrientes) dibujarNutrientes();
  if (estado.mostrarGrilla) dibujarGrilla();

  dibujarCelulas();
  dibujarDepredadores();
  dibujarInspector();
}

/* ----------------------------------------------------------------- gráfico */

function dibujarGrafico() {
  const anchoG = grafico.width;
  const altoG = grafico.height;
  ctxGrafico.clearRect(0, 0, anchoG, altoG);

  const muestras = estado.muestras;
  if (muestras.length < 2) {
    ctxGrafico.fillStyle = 'rgba(111, 138, 124, 0.8)';
    ctxGrafico.font = '11px ui-monospace, monospace';
    ctxGrafico.fillText('midiendo…', 8, altoG / 2);
    return;
  }

  const maximo = Math.log10(Math.max(1, ...muestras.map((m) => Math.max(m.grilla, m.bruta))) + 1);

  const trazar = (clave, color) => {
    ctxGrafico.strokeStyle = color;
    ctxGrafico.lineWidth = 2;
    ctxGrafico.beginPath();
    muestras.forEach((muestra, i) => {
      const x = (i / (muestras.length - 1)) * (anchoG - 8) + 4;
      const proporcion = Math.log10(Math.max(0, muestra[clave]) + 1) / maximo;
      const y = altoG - 6 - proporcion * (altoG - 16);
      if (i === 0) ctxGrafico.moveTo(x, y);
      else ctxGrafico.lineTo(x, y);
    });
    ctxGrafico.stroke();
  };

  // Línea base y ambas series.
  ctxGrafico.strokeStyle = 'rgba(68, 255, 136, 0.12)';
  ctxGrafico.lineWidth = 1;
  ctxGrafico.beginPath();
  ctxGrafico.moveTo(0, altoG - 6);
  ctxGrafico.lineTo(anchoG, altoG - 6);
  ctxGrafico.stroke();

  trazar('bruta', '#ff6b6b');
  trazar('grilla', '#44ff88');
}

/* -------------------------------------------------------------------- HUD */

function numero(valor) {
  return new Intl.NumberFormat('es-AR').format(valor);
}

function actualizarPanel() {
  if (!mundo) return;

  const celulas = mundo.celulas.length;
  const depredadores = mundo.depredadores.length;
  const bruto = celulas * Math.max(1, celulas - 1) + depredadores * celulas;

  ui.celulas.textContent = numero(celulas);
  ui.depredadores.textContent = numero(depredadores);
  ui.fps.textContent = numero(estado.fps);
  ui.checks.textContent = numero(mundo.checks);
  ui.modo.textContent = estado.fuerzaBruta ? 'Fuerza bruta' : 'Grilla espacial';
  ui.celdas.textContent = estado.fuerzaBruta ? '—' : numero(mundo.hash.occupiedCells);

  if (estado.fuerzaBruta) {
    const veces = mundo.ultimoHash > 0 ? Math.round(mundo.checks / mundo.ultimoHash) : 0;
    ui.ahorro.textContent =
      veces > 0
        ? `≈ ${numero(veces)}× más comparaciones que con la grilla (${numero(mundo.ultimoHash)}).`
        : 'Comparando cada célula contra todas las demás.';
  } else {
    ui.ahorro.textContent = `Cada consulta revisa solo las celdas cercanas: ${numero(
      mundo.checks,
    )} comparaciones en el último frame.`;
  }

  estado.muestras.push({
    grilla: estado.fuerzaBruta ? mundo.ultimoHash || mundo.checks : mundo.checks,
    bruta: bruto,
  });
  if (estado.muestras.length > 60) estado.muestras.shift();
  dibujarGrafico();

  const veces = mundo.checks > 0 ? Math.max(1, Math.round(bruto / Math.max(1, mundo.checks))) : 0;
  ui.factor.textContent = veces
    ? `${numero(mundo.checks)} vs ${numero(bruto)} · ${numero(veces)}× menos`
    : '';
}

/* --------------------------------------------------------------- inspector */

function actualizarInspector() {
  if (!mundo) return;

  // La selección se muestra aunque el cursor no esté sobre el lienzo.
  const elegida = estado.seleccionada
    ? mundo.celulas.find((celula) => celula.id === estado.seleccionada)
    : null;

  if (elegida) {
    ui.seleccion.hidden = false;
    ui.seleccion.textContent = `Seleccionada: energía ${elegida.energia.toFixed(2)} · edad ${elegida.edad.toFixed(1)} s · ${Math.round(
      Math.hypot(elegida.vx, elegida.vy),
    )} px/s`;
  } else {
    estado.seleccionada = null;
    ui.seleccion.hidden = true;
  }

  if (!estado.cursor) return;

  const { x, y } = estado.cursor;
  const cercanas = mundo.hash.query(x, y, 26);
  let objetivo = null;
  let mejor = Infinity;
  for (const celula of cercanas) {
    const d = Math.hypot(celula.x - x, celula.y - y);
    if (d < mejor) {
      mejor = d;
      objetivo = celula;
    }
  }

  if (!objetivo) {
    estado.inspeccion = null;
    ui.inspector.textContent = 'Pasá el mouse sobre el lienzo para inspeccionar una célula.';
    ui.inspectorDatos.hidden = true;
    return;
  }

  const consulta = inspeccionarConsulta(mundo, objetivo.x, objetivo.y);
  estado.inspeccion = { ...consulta, x: objetivo.x, y: objetivo.y };

  ui.inspectorDatos.hidden = false;
  ui.iCeldas.textContent = numero(consulta.celdas.length);
  ui.iDistancias.textContent = numero(consulta.evaluadas);
  ui.iVecinas.textContent = numero(consulta.vecinos.length);
  ui.inspector.textContent = 'Consulta simulada de la célula bajo el cursor:';
}

/* --------------------------------------------------------------- controles */

function alternarPausa() {
  estado.corriendo = !estado.corriendo;
  ui.pausa.textContent = estado.corriendo ? 'Pausar' : 'Reanudar';
  ui.pausa.setAttribute('aria-pressed', String(!estado.corriendo));
}

function sincronizarUrl() {
  escribirUrl({
    preset: estado.preset,
    celulas: mundo ? mundo.celulas.length : null,
    bruta: estado.fuerzaBruta,
    grilla: estado.mostrarGrilla,
  });
}

ui.pausa.addEventListener('click', alternarPausa);

ui.reiniciar.addEventListener('click', () => {
  crearMundoActual();
  actualizarPanel();
});

ui.agregar.addEventListener('click', () => {
  if (!mundo) return;
  const espacio = mundo.cfg.maxCelulas - mundo.celulas.length;
  const cantidad = Math.min(50, espacio);
  for (let i = 0; i < cantidad; i++) {
    mundo.celulas.push(crearCelula(mundo, mundo.rnd() * ancho, mundo.rnd() * alto));
  }
  sincronizarUrl();
  actualizarPanel();
});

ui.nutrientes.addEventListener('click', () => {
  estado.mostrarNutrientes = !estado.mostrarNutrientes;
  ui.nutrientes.setAttribute('aria-pressed', String(estado.mostrarNutrientes));
});

ui.grilla.addEventListener('click', () => {
  estado.mostrarGrilla = !estado.mostrarGrilla;
  ui.grilla.setAttribute('aria-pressed', String(estado.mostrarGrilla));
  sincronizarUrl();
});

ui.bruta.addEventListener('click', () => {
  estado.fuerzaBruta = !estado.fuerzaBruta;
  mundo.checksBrutos = 0;
  ui.bruta.setAttribute('aria-pressed', String(estado.fuerzaBruta));
  sincronizarUrl();
  actualizarPanel();
});

ui.velocidad.addEventListener('input', () => {
  estado.velocidad = Number(ui.velocidad.value);
  if (mundo) mundo.velocidad = estado.velocidad;
  ui.velocidadValor.textContent = `${estado.velocidad.toString().replace('.', ',')}×`;
});

ui.preset.addEventListener('change', () => {
  cambiarPreset(ui.preset.value);
});

lienzo.addEventListener('pointermove', (evento) => {
  const rect = lienzo.getBoundingClientRect();
  estado.cursor = {
    x: ((evento.clientX - rect.left) / rect.width) * ancho,
    y: ((evento.clientY - rect.top) / rect.height) * alto,
  };
});

lienzo.addEventListener('pointerleave', () => {
  estado.cursor = null;
  estado.inspeccion = null;
  ui.inspectorDatos.hidden = true;
  ui.inspector.textContent = 'Pasá el mouse sobre el lienzo para inspeccionar una célula.';
});

lienzo.addEventListener('pointerdown', (evento) => {
  if (!mundo) return;
  const rect = lienzo.getBoundingClientRect();
  const x = ((evento.clientX - rect.left) / rect.width) * ancho;
  const y = ((evento.clientY - rect.top) / rect.height) * alto;

  // Primero intenta seleccionar una célula; si no hay, siembra nutrientes.
  const cercanas = mundo.hash.query(x, y, 26);
  let objetivo = null;
  let mejor = Infinity;
  for (const celula of cercanas) {
    const d = Math.hypot(celula.x - x, celula.y - y);
    if (d < mejor) {
      mejor = d;
      objetivo = celula;
    }
  }

  if (objetivo) {
    estado.seleccionada = objetivo.id;
    return;
  }

  sembrarNutrientes(mundo, x, y, 3, 0.85);
  if (!pistaOculta) {
    pistaOculta = true;
    pista.classList.add('escenario__pista--oculta');
  }
});

document.addEventListener('keydown', (evento) => {
  if (evento.target instanceof HTMLInputElement || evento.target instanceof HTMLSelectElement) return;

  const tecla = evento.key.toLowerCase();
  if (tecla === ' ') { evento.preventDefault(); alternarPausa(); }
  if (tecla === 'r') ui.reiniciar.click();
  if (tecla === 'g') ui.grilla.click();
  if (tecla === 'b') ui.bruta.click();
  if (tecla === 'n') ui.nutrientes.click();
  if (tecla === 'escape') estado.seleccionada = null;
});

/* ------------------------------------------------------------------ bucle */

function bucle(tiempo) {
  try {
    const delta = ultimoTiempo ? (tiempo - ultimoTiempo) / 1000 : 0;
    ultimoTiempo = tiempo;
    const dt = Math.min(delta, 0.05);

    if (estado.corriendo && mundo) {
      pasoMundo(mundo, dt, { fuerzaBruta: estado.fuerzaBruta });

      frames++;
      acumulador += dt;
      if (acumulador >= 0.5) {
        estado.fps = Math.round(frames / acumulador);
        frames = 0;
        acumulador = 0;
        actualizarPanel();
      }
    }

    // El inspector se refresca seguido, incluso en pausa (la grilla del
    // último frame sigue siendo válida).
    acumuladorInspector += dt;
    if (acumuladorInspector >= 0.12) {
      acumuladorInspector = 0;
      actualizarInspector();
    }

    dibujar();
  } catch (error) {
    estado.corriendo = false;
    document.body.dataset.error = String(error && error.message ? error.message : error);
    console.error('[Kernel Bio]', error);
  } finally {
    requestAnimationFrame(bucle);
  }
}

/* ------------------------------------------------------------------ inicio */

ajustarLienzo();
crearMundoActual(true);

for (const [nombre, preset] of Object.entries(PRESETS)) {
  const opcion = document.createElement('option');
  opcion.value = nombre;
  opcion.textContent = preset.etiqueta;
  ui.preset.appendChild(opcion);
}
ui.preset.value = estado.preset;

ui.grilla.setAttribute('aria-pressed', String(estado.mostrarGrilla));
ui.bruta.setAttribute('aria-pressed', String(estado.fuerzaBruta));
mundo.velocidad = estado.velocidad;
estado.fps = 60;
actualizarPanel();
sincronizarUrl();

new ResizeObserver(() => {
  ajustarLienzo();
  redimensionarMundo();
  actualizarPanel();
}).observe(lienzo);
requestAnimationFrame(bucle);
