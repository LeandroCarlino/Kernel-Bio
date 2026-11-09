import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash, queryBruteForce } from '../js/spatial-hash.js';

const punto = (x, y, id = `${x},${y}`) => ({ x, y, id });

test('inserta y cuenta las entidades', () => {
  const hash = new SpatialHash(50);
  hash.insert(punto(10, 10));
  hash.insert(punto(80, 10));

  assert.equal(hash.count, 2);
  assert.equal(hash.occupiedCells, 2);
});

test('encuentra solo lo que está dentro del radio', () => {
  const hash = new SpatialHash(50);
  const cerca = punto(12, 10, 'cerca');
  const lejos = punto(200, 200, 'lejos');
  hash.insert(cerca);
  hash.insert(lejos);

  const resultado = hash.query(10, 10, 20);

  assert.deepEqual(resultado.map((p) => p.id), ['cerca']);
});

test('incluye el borde exacto del radio', () => {
  const hash = new SpatialHash(50);
  hash.insert(punto(30, 10, 'borde'));

  assert.equal(hash.query(10, 10, 20).length, 1);
  assert.equal(hash.query(10, 10, 19.9).length, 0);
});

test('cruza celdas contiguas sin duplicar', () => {
  const hash = new SpatialHash(20);
  // Tres puntos en celdas distintas alrededor del origen.
  hash.insert(punto(-5, -5, 'a'));
  hash.insert(punto(5, 5, 'b'));
  hash.insert(punto(15, -15, 'c'));

  const resultado = hash.query(0, 0, 40).map((p) => p.id).sort();

  assert.deepEqual(resultado, ['a', 'b', 'c']);
});

test('acepta un filtro para excluir entidades', () => {
  const hash = new SpatialHash(50);
  hash.insert(punto(10, 10, 'uno'));
  hash.insert(punto(12, 12, 'dos'));

  const resultado = hash.query(10, 10, 20, (p) => p.id !== 'uno');

  assert.deepEqual(resultado.map((p) => p.id), ['dos']);
});

test('clear vacía la grilla y los contadores', () => {
  const hash = new SpatialHash(50);
  hash.insert(punto(1, 1));
  hash.query(0, 0, 100);
  assert.ok(hash.tests > 0);

  hash.clear();

  assert.equal(hash.count, 0);
  assert.equal(hash.occupiedCells, 0);
  assert.equal(hash.tests, 0);
  assert.deepEqual(hash.query(0, 0, 100), []);
});

test('la grilla y la fuerza bruta devuelven lo mismo', () => {
  const puntos = Array.from({ length: 200 }, () =>
    punto(Math.random() * 1000, Math.random() * 1000, Math.random().toString(36)),
  );

  let hash = new SpatialHash(48);
  for (const p of puntos) hash.insert(p);

  for (let i = 0; i < 25; i++) {
    const x = Math.random() * 1000;
    const y = Math.random() * 1000;
    const radio = 30 + Math.random() * 60;

    const conGrilla = hash.query(x, y, radio).map((p) => p.id).sort();
    const conFuerzaBruta = queryBruteForce(puntos, x, y, radio).map((p) => p.id).sort();

    assert.deepEqual(conGrilla, conFuerzaBruta);
  }
});

test('la grilla evalúa menos distancias que la fuerza bruta', () => {
  const puntos = Array.from({ length: 400 }, () =>
    punto(Math.random() * 1000, Math.random() * 1000),
  );

  const hash = new SpatialHash(48);
  for (const p of puntos) hash.insert(p);
  for (const p of puntos) hash.query(p.x, p.y, 36);
  const conGrilla = hash.tests;

  let conFuerzaBruta = 0;
  for (const p of puntos) {
    conFuerzaBruta += puntos.length;
    queryBruteForce(puntos, p.x, p.y, 36);
  }

  assert.ok(
    conGrilla < conFuerzaBruta / 5,
    `esperaba muchas menos comparaciones, obtuve ${conGrilla} vs ${conFuerzaBruta}`,
  );
});

test('rechaza un tamaño de celda inválido', () => {
  assert.throws(() => new SpatialHash(0), RangeError);
  assert.throws(() => new SpatialHash(-10), RangeError);
  assert.throws(() => new SpatialHash(Number.NaN), RangeError);
});
