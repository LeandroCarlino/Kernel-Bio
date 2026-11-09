/**
 * Grilla espacial (spatial hash) para consultar vecinos sin recorrer
 * todas las entidades.
 *
 * Divide el plano en celdas cuadradas y guarda cada entidad en la celda
 * que le corresponde. Consultar un radio solo visita las celdas que lo
 * tocan, en lugar de O(n) por entidad.
 */
export class SpatialHash {
  /** @param {number} cellSize lado de cada celda, en píxeles */
  constructor(cellSize = 48) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError('cellSize debe ser un número mayor que 0');
    }
    this.cellSize = cellSize;
    /** @type {Map<string, Array<{x: number, y: number}>>} */
    this.buckets = new Map();
    this.count = 0;
    /** Distancias evaluadas en la última tanda de consultas (para medir). */
    this.tests = 0;
  }

  /** Vacía la grilla sin crear una nueva (para reusar en cada frame). */
  clear() {
    this.buckets.clear();
    this.count = 0;
    this.tests = 0;
  }

  /** @param {{x: number, y: number}} item */
  key(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  insert(item) {
    const key = this.key(item.x, item.y);
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(item);
    else this.buckets.set(key, [item]);
    this.count++;
  }

  /**
   * Devuelve las entidades dentro de `radius` (distancia euclidiana) de
   * (x, y). Incluye el borde del radio.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {(item: any) => boolean} [filter]
   */
  query(x, y, radius, filter) {
    const resultados = [];
    const { cellSize } = this;
    const minX = Math.floor((x - radius) / cellSize);
    const maxX = Math.floor((x + radius) / cellSize);
    const minY = Math.floor((y - radius) / cellSize);
    const maxY = Math.floor((y + radius) / cellSize);
    const r2 = radius * radius;

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(`${cx},${cy}`);
        if (!bucket) continue;

        for (const item of bucket) {
          this.tests++;
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy > r2) continue;
          if (filter && !filter(item)) continue;
          resultados.push(item);
        }
      }
    }

    return resultados;
  }

  /** Cantidad de celdas ocupadas (útil para el panel de diagnóstico). */
  get occupiedCells() {
    return this.buckets.size;
  }
}

/**
 * Versión sin grilla, para comparar en la interfaz: recorre todo el
 * arreglo para cada consulta. Devuelve lo mismo que `query`.
 *
 * @param {Array<{x: number, y: number}>} items
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {(item: any) => boolean} [filter]
 */
export function queryBruteForce(items, x, y, radius, filter) {
  const resultados = [];
  const r2 = radius * radius;

  for (const item of items) {
    const dx = item.x - x;
    const dy = item.y - y;
    if (dx * dx + dy * dy > r2) continue;
    if (filter && !filter(item)) continue;
    resultados.push(item);
  }

  return resultados;
}
