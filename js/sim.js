import { SpatialHash, queryBruteForce } from './spatial-hash.js';

const TAU = Math.PI * 2;

const CONFIG = {
  maxCelulas: 700,
  radioVecindad: 36,
  radioSeparacion: 16,
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
};

const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d', { alpha: false });
const pista = document.getElementById('pista');
const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  celulas: document.getElementById('m-celulas'),
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
};

const estado = {
  corriendo: true,
  velocidad: 1,
  mostrarGrilla: false,
  mostrarNutrientes: true,
  fuerzaBruta: false,
  celulas: [],
  nutrientes: null,
  cols: 0,
  filas: 0,
  checks: 0,
  checksBrutos: 0,
  ultimoHash: 0,
  hash: new SpatialHash(CONFIG.celdaHash),
  fps: 60,
};

let ancho = 0;
let alto = 0;
let dpr = 1;
let ultimoTiempo = 0;
let frames = 0;
let acumulador = 0;
let pistaOculta = false;

const capaNutrientes = document.createElement('canvas');
const ctxNutrientes = capaNutrientes.getContext('2d');

/* ------------------------------------------------------------------ setup */

function ajustarLienzo() {
  const rect = lienzo.getBoundingClientRect();
  const nuevoAncho = Math.max(1, Math.round(rect.width));
  const nuevoAlto = Math.max(1, Math.round(rect.height));
  if (nuevoAncho === ancho && nuevoAlto === alto) return;

  ancho = nuevoAncho;
  alto = nuevoAlto;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#030805';
  ctx.fillRect(0, 0, ancho, alto);

  crearNutrientes();

  for (const celula of estado.celulas) {
    celula.x = Math.min(Math.max(celula.x, 4), ancho - 4);
    celula.y = Math.min(Math.max(celula.y, 4), alto - 4);
  }
}

function crearNutrientes() {
  const cols = Math.max(4, Math.round(ancho / CONFIG.celdaNutriente));
  const filas = Math.max(4, Math.round(alto / CONFIG.celdaNutriente));
  const datos = new Float32Array(cols * filas);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 0.75;

  estado.nutrientes = datos;
  estado.cols = cols;
  estado.filas = filas;
  capaNutrientes.width = cols;
  capaNutrientes.height = filas;
}

function crearCelula(x, y, energia, vx, vy) {
  return {
    x,
    y,
    vx: vx ?? (Math.random() - 0.5) * CONFIG.velocidadBase,
    vy: vy ?? (Math.random() - 0.5) * CONFIG.velocidadBase,
    energia: energia ?? CONFIG.energiaInicial,
    radio: 2.4 + Math.random() * 1.6,
    edad: 0,
  };
}

function reiniciar() {
  estado.celulas = [];
  estado.checks = 0;
  estado.checksBrutos = 0;
  estado.ultimoHash = 0;
  estado.hash.clear();

  const cantidad = Math.round(Math.min(180, (ancho * alto) / 3200));
  for (let i = 0; i < cantidad; i++) {
    estado.celulas.push(crearCelula(Math.random() * ancho, Math.random() * alto));
  }
}

/* --------------------------------------------------------------- nutrientes */

function indiceNutriente(x, y) {
  const cx = Math.floor(x / CONFIG.celdaNutriente);
  const cy = Math.floor(y / CONFIG.celdaNutriente);
  if (cx < 0 || cy < 0 || cx >= estado.cols || cy >= estado.filas) return -1;
  return cy * estado.cols + cx;
}

function comer(zona, cantidad) {
  if (zona < 0) return 0;
  const disponible = estado.nutrientes[zona];
  const tomado = Math.min(disponible, cantidad);
  estado.nutrientes[zona] = disponible - tomado;
  return tomado;
}

function gradiente(x, y) {
  const paso = CONFIG.celdaNutriente;
  const izquierda = indiceNutriente(x - paso, y);
  const derecha = indiceNutriente(x + paso, y);
  const arriba = indiceNutriente(x, y - paso);
  const abajo = indiceNutriente(x, y + paso);

  const gx = (derecha >= 0 ? estado.nutrientes[derecha] : 0) - (izquierda >= 0 ? estado.nutrientes[izquierda] : 0);
  const gy = (abajo >= 0 ? estado.nutrientes[abajo] : 0) - (arriba >= 0 ? estado.nutrientes[arriba] : 0);
  return { gx, gy };
}

function regenerar(dt) {
  const datos = estado.nutrientes;
  const incremento = CONFIG.regeneracion * dt;
  for (let i = 0; i < datos.length; i++) {
    if (datos[i] < 1) datos[i] = Math.min(1, datos[i] + incremento);
  }
}

/* -------------------------------------------------------------- simulación */

function paso(dt) {
  const celulas = estado.celulas;
  const hash = estado.hash;
  const maxVelocidad = CONFIG.velocidadBase * estado.velocidad;
  const nacidas = [];

  estado.checksBrutos = 0;
  hash.clear();
  for (const celula of celulas) hash.insert(celula);

  for (const celula of celulas) {
    let vecinos;

    if (estado.fuerzaBruta) {
      estado.checksBrutos += celulas.length;
      vecinos = queryBruteForce(celulas, celula.x, celula.y, CONFIG.radioVecindad, (otra) => otra !== celula);
    } else {
      vecinos = hash.query(celula.x, celula.y, CONFIG.radioVecindad, (otra) => otra !== celula);
    }

    let ax = 0;
    let ay = 0;

    // Separación: si están muy juntas, se empujan.
    for (const otra of vecinos) {
      const dx = celula.x - otra.x;
      const dy = celula.y - otra.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < CONFIG.radioSeparacion ** 2) {
        const d = Math.sqrt(d2);
        const fuerza = (1 - d / CONFIG.radioSeparacion) / d;
        ax += dx * fuerza;
        ay += dy * fuerza;
      }
    }

    // Cohesión muy suave: forman colonias sin pegarse.
    if (vecinos.length > 0) {
      let cx = 0;
      let cy = 0;
      for (const otra of vecinos) {
        cx += otra.x;
        cy += otra.y;
      }
      cx /= vecinos.length;
      cy /= vecinos.length;
      ax += (cx - celula.x) * 0.012;
      ay += (cy - celula.y) * 0.012;
    }

    // Quimiotaxis: suben el gradiente de nutrientes.
    const { gx, gy } = gradiente(celula.x, celula.y);
    ax += gx * 220;
    ay += gy * 220;

    // Ruido vital.
    ax += (Math.random() - 0.5) * 40;
    ay += (Math.random() - 0.5) * 40;

    celula.vx += ax * dt;
    celula.vy += ay * dt;

    const rapidez = Math.hypot(celula.vx, celula.vy);
    if (rapidez > maxVelocidad) {
      celula.vx = (celula.vx / rapidez) * maxVelocidad;
      celula.vy = (celula.vy / rapidez) * maxVelocidad;
    }

    const desplazamientoX = celula.vx * dt;
    const desplazamientoY = celula.vy * dt;
    celula.x += desplazamientoX;
    celula.y += desplazamientoY;
    celula.edad += dt;

    // Rebote en los bordes.
    if (celula.x < 3) { celula.x = 3; celula.vx = Math.abs(celula.vx); }
    if (celula.x > ancho - 3) { celula.x = ancho - 3; celula.vx = -Math.abs(celula.vx); }
    if (celula.y < 3) { celula.y = 3; celula.vy = Math.abs(celula.vy); }
    if (celula.y > alto - 3) { celula.y = alto - 3; celula.vy = -Math.abs(celula.vy); }

    // Metabolismo y alimentación.
    const distancia = Math.hypot(desplazamientoX, desplazamientoY);
    celula.energia -= CONFIG.decaimiento * dt + distancia * CONFIG.costoPorPixel;

    const zona = indiceNutriente(celula.x, celula.y);
    const tomado = comer(zona, dt * 0.9);
    if (tomado > 0) {
      celula.energia = Math.min(CONFIG.energiaMax, celula.energia + tomado * CONFIG.comida);
    }

    // División si está bien alimentada y hay espacio.
    if (
      celula.energia >= CONFIG.energiaParaDividir &&
      celulas.length + nacidas.length < CONFIG.maxCelulas &&
      vecinos.length < 6
    ) {
      celula.energia /= 2;
      nacidas.push(
        crearCelula(
          celula.x + (Math.random() - 0.5) * 6,
          celula.y + (Math.random() - 0.5) * 6,
          celula.energia * 0.9,
          celula.vx * 0.8 + (Math.random() - 0.5) * 20,
          celula.vy * 0.8 + (Math.random() - 0.5) * 20,
        ),
      );
    }
  }

  for (const nacida of nacidas) estado.celulas.push(nacida);

  // Mueren las que se quedaron sin energía.
  estado.celulas = estado.celulas.filter((celula) => celula.energia > 0);

  if (!estado.fuerzaBruta) {
    estado.checks = hash.tests;
    estado.ultimoHash = hash.tests;
  } else {
    estado.checks = estado.checksBrutos;
  }

  regenerar(dt);
}

/* ---------------------------------------------------------------- dibujado */

function dibujarNutrientes() {
  const { cols, filas, nutrientes } = estado;
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

function dibujar() {
  // Estela: en vez de limpiar, se oscurece el cuadro anterior.
  ctx.fillStyle = reducirMovimiento ? '#030805' : 'rgba(3, 8, 5, 0.22)';
  ctx.fillRect(0, 0, ancho, alto);

  if (estado.mostrarNutrientes) dibujarNutrientes();

  if (estado.mostrarGrilla) {
    ctx.strokeStyle = 'rgba(68, 255, 136, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= ancho; x += CONFIG.celdaHash) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, alto);
    }
    for (let y = 0; y <= alto; y += CONFIG.celdaHash) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(ancho, y + 0.5);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(68, 255, 136, 0.05)';
    for (const [clave] of estado.hash.buckets) {
      const [cx, cy] = clave.split(',').map(Number);
      ctx.fillRect(cx * CONFIG.celdaHash, cy * CONFIG.celdaHash, CONFIG.celdaHash, CONFIG.celdaHash);
    }
  }

  for (const celula of estado.celulas) {
    const energia = Math.min(1, celula.energia / CONFIG.energiaMax);

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
  }
}

/* -------------------------------------------------------------------- HUD */

function numero(valor) {
  return new Intl.NumberFormat('es-AR').format(valor);
}

function actualizarPanel() {
  ui.celulas.textContent = numero(estado.celulas.length);
  ui.fps.textContent = numero(estado.fps);
  ui.checks.textContent = numero(estado.checks);
  ui.modo.textContent = estado.fuerzaBruta ? 'Fuerza bruta' : 'Grilla espacial';
  ui.celdas.textContent = estado.fuerzaBruta ? '—' : numero(estado.hash.occupiedCells);

  if (estado.fuerzaBruta) {
    const veces = estado.ultimoHash > 0 ? Math.round(estado.checks / estado.ultimoHash) : 0;
    ui.ahorro.textContent =
      veces > 0
        ? `≈ ${numero(veces)}× más comparaciones que con la grilla (${numero(estado.ultimoHash)}).`
        : 'Comparando cada célula contra todas las demás.';
  } else {
    ui.ahorro.textContent = `Cada consulta revisa solo las celdas cercanas: ${numero(
      estado.checks,
    )} comparaciones en el último frame.`;
  }
}

/* --------------------------------------------------------------- controles */

function alternarPausa() {
  estado.corriendo = !estado.corriendo;
  ui.pausa.textContent = estado.corriendo ? 'Pausar' : 'Reanudar';
  ui.pausa.setAttribute('aria-pressed', String(!estado.corriendo));
}

ui.pausa.addEventListener('click', alternarPausa);

ui.reiniciar.addEventListener('click', () => {
  reiniciar();
  actualizarPanel();
});

ui.agregar.addEventListener('click', () => {
  const espacio = CONFIG.maxCelulas - estado.celulas.length;
  const cantidad = Math.min(50, espacio);
  for (let i = 0; i < cantidad; i++) {
    estado.celulas.push(crearCelula(Math.random() * ancho, Math.random() * alto));
  }
  actualizarPanel();
});

ui.nutrientes.addEventListener('click', () => {
  estado.mostrarNutrientes = !estado.mostrarNutrientes;
  ui.nutrientes.setAttribute('aria-pressed', String(estado.mostrarNutrientes));
});

ui.grilla.addEventListener('click', () => {
  estado.mostrarGrilla = !estado.mostrarGrilla;
  ui.grilla.setAttribute('aria-pressed', String(estado.mostrarGrilla));
});

ui.bruta.addEventListener('click', () => {
  estado.fuerzaBruta = !estado.fuerzaBruta;
  estado.checks = 0;
  estado.checksBrutos = 0;
  ui.bruta.setAttribute('aria-pressed', String(estado.fuerzaBruta));
  actualizarPanel();
});

ui.velocidad.addEventListener('input', () => {
  estado.velocidad = Number(ui.velocidad.value);
  ui.velocidadValor.textContent = `${estado.velocidad.toString().replace('.', ',')}×`;
});

lienzo.addEventListener('pointerdown', (evento) => {
  const rect = lienzo.getBoundingClientRect();
  const x = ((evento.clientX - rect.left) / rect.width) * ancho;
  const y = ((evento.clientY - rect.top) / rect.height) * alto;
  const paso = CONFIG.celdaNutriente;

  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 9) continue;
      const zona = indiceNutriente(x + dx * paso, y + dy * paso);
      if (zona >= 0) estado.nutrientes[zona] = Math.min(1, estado.nutrientes[zona] + 0.85);
    }
  }

  if (!pistaOculta) {
    pistaOculta = true;
    pista.classList.add('escenario__pista--oculta');
  }
});

document.addEventListener('keydown', (evento) => {
  if (evento.target instanceof HTMLInputElement) return;

  const tecla = evento.key.toLowerCase();
  if (tecla === ' ') { evento.preventDefault(); alternarPausa(); }
  if (tecla === 'r') ui.reiniciar.click();
  if (tecla === 'g') ui.grilla.click();
  if (tecla === 'b') ui.bruta.click();
  if (tecla === 'n') ui.nutrientes.click();
});

/* ------------------------------------------------------------------ bucle */

function bucle(tiempo) {
  try {
    const delta = ultimoTiempo ? (tiempo - ultimoTiempo) / 1000 : 0;
    ultimoTiempo = tiempo;
    const dt = Math.min(delta, 0.05);

    if (estado.corriendo) {
      paso(dt);

      frames++;
      acumulador += dt;
      if (acumulador >= 0.5) {
        estado.fps = Math.round(frames / acumulador);
        frames = 0;
        acumulador = 0;
        actualizarPanel();
      }
    }

    dibujar();
  } catch (error) {
    // Un frame roto no debe congelar la simulación para siempre.
    estado.corriendo = false;
    document.body.dataset.error = String(error && error.message ? error.message : error);
    console.error('[Kernel Bio]', error);
  } finally {
    requestAnimationFrame(bucle);
  }
}

ajustarLienzo();
reiniciar();
actualizarPanel();
ui.velocidadValor.textContent = '1×';

new ResizeObserver(() => {
  ajustarLienzo();
  actualizarPanel();
}).observe(lienzo);

requestAnimationFrame(bucle);
