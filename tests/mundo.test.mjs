import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crearMundo,
  crearCelula,
  crearDepredador,
  pasoMundo,
  sembrarNutrientes,
  nutrientesEn,
  inspeccionarConsulta,
} from '../js/mundo.js';

const quieto = () => 0.5; // RNG determinista: sin velocidades ni ruido

/** PRNG sembrado (mulberry32) para distribuir entidades de forma reproducible. */
function sembrado(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mundoBase(extra = {}) {
  return crearMundo({
    ancho: 400,
    alto: 400,
    rnd: quieto,
    config: { regeneracion: 0, decaimiento: 0.05, celulasIniciales: 0, ...extra },
  });
}

test('crea el mundo con nutrientes y células', () => {
  const mundo = crearMundo({
    ancho: 400,
    alto: 400,
    rnd: quieto,
    config: { celulasIniciales: 25 },
  });

  assert.equal(mundo.celulas.length, 25);
  assert.ok(mundo.nutrientes.length > 0);
  assert.equal(mundo.cols * mundo.filas, mundo.nutrientes.length);
  assert.ok(mundo.nutrientes.every((v) => v >= 0 && v <= 1));
});

test('las células pierden energía cuando no hay comida', () => {
  const mundo = mundoBase();
  mundo.nutrientes.fill(0);
  const celula = crearCelula(mundo, 200, 200, 1);
  mundo.celulas = [celula];

  pasoMundo(mundo, 0.1);

  assert.ok(celula.energia < 1);
});

test('una célula con energía se divide', () => {
  const mundo = mundoBase();
  mundo.celulas = [crearCelula(mundo, 200, 200, 2.5)];

  pasoMundo(mundo, 1 / 60);

  assert.equal(mundo.celulas.length, 2);
});

test('una célula sin energía muere', () => {
  const mundo = mundoBase();
  mundo.nutrientes.fill(0);
  mundo.celulas = [crearCelula(mundo, 200, 200, 0.0001)];

  pasoMundo(mundo, 0.5);

  assert.equal(mundo.celulas.length, 0);
});

test('siembra nutrientes y no pasa de 1', () => {
  const mundo = mundoBase();
  mundo.nutrientes.fill(0);

  sembrarNutrientes(mundo, 200, 200, 2, 0.6);
  const primero = nutrientesEn(mundo, 200, 200);
  assert.ok(primero > 0);

  for (let i = 0; i < 5; i++) sembrarNutrientes(mundo, 200, 200, 2, 0.6);

  assert.equal(nutrientesEn(mundo, 200, 200), 1);
});

test('el depredador come una célula cercana', () => {
  const mundo = mundoBase({ depredadores: true, maxDepredadores: 4 });
  mundo.celulas = [crearCelula(mundo, 200, 200, 1)];
  const depredador = crearDepredador(mundo, 205, 200, 1.5);
  mundo.depredadores = [depredador];

  const energiaAntes = depredador.energia;
  pasoMundo(mundo, 1 / 60);

  assert.equal(mundo.celulas.length, 0);
  assert.ok(depredador.energia > energiaAntes);
});

test('el depredador muere si no come', () => {
  const mundo = mundoBase({ depredadores: true });
  mundo.celulas = [];
  mundo.depredadores = [crearDepredador(mundo, 200, 200, 0.01)];

  pasoMundo(mundo, 1);

  assert.equal(mundo.depredadores.length, 0);
});

test('la inspección devuelve vecinas y no contamina las métricas', () => {
  const mundo = mundoBase();
  mundo.celulas = [
    crearCelula(mundo, 200, 200, 1),
    crearCelula(mundo, 210, 200, 1),
    crearCelula(mundo, 380, 380, 1),
  ];

  pasoMundo(mundo, 1 / 60);
  const testsAntes = mundo.hash.tests;

  const consulta = inspeccionarConsulta(mundo, 200, 200, 36);

  assert.ok(consulta.vecinos.length >= 2);
  assert.ok(consulta.celdas.length >= 1);
  assert.ok(consulta.evaluadas > 0);
  assert.equal(mundo.hash.tests, testsAntes);
});

test('la fuerza bruta y la grilla dan el mismo vecindario', () => {
  const mundo = crearMundo({
    ancho: 400,
    alto: 400,
    rnd: sembrado(42),
    config: { celulasIniciales: 60, regeneracion: 0 },
  });

  pasoMundo(mundo, 1 / 60);
  const conGrilla = mundo.checks;
  const poblacion = mundo.celulas.length;

  pasoMundo(mundo, 1 / 60, { fuerzaBruta: true });
  const conFuerzaBruta = mundo.checks;

  assert.ok(poblacion > 10);
  assert.ok(conGrilla > 0);
  assert.ok(
    conFuerzaBruta > conGrilla,
    `la grilla debería hacer menos comparaciones (${conGrilla} vs ${conFuerzaBruta})`,
  );
});
