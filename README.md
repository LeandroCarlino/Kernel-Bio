# Kernel Bio

Simulación de células en un medio con nutrientes. Cada célula busca comida, gasta energía, se divide si está bien alimentada y muere si se queda sin nada. Para encontrar vecinas usa una **grilla espacial (spatial hashing)**, y la interfaz permite comparar en vivo contra **fuerza bruta**.

**Demo:** https://leandrocarlino.github.io/Kernel-Bio/

## Por qué spatial hashing

Si cada célula se compara contra todas las demás, el costo por frame crece al cuadrado: con 700 células son **490.000** comparaciones. La grilla divide el plano en celdas de 48 px y solo revisa las que tocan el radio de visión de cada célula: con las mismas 700, unas **9.700** comparaciones, es decir ~50 veces menos.

El botón **Fuerza bruta** cambia el modo y muestra la diferencia real en el panel, medida en cada frame.

## Cómo funciona la simulación

Cada célula tiene posición, velocidad, energía y edad:

1. **Separación**: si dos células están muy cerca, se empujan.
2. **Cohesión suave**: tienden a formar colonias sin pegarse.
3. **Quimiotaxis**: suben el gradiente de nutrientes de la grilla de comida.
4. **Metabolismo**: pierden energía con el tiempo y con la distancia recorrida.
5. **División**: al superar el umbral de energía, y si no están apiñadas, se dividen en dos.
6. **Muerte**: cuando la energía llega a cero, desaparecen.

Los nutrientes se regeneran lentamente y podés sembrarlos haciendo clic (o tocando) el lienzo.

## Controles

| Acción | Cómo |
|---|---|
| Pausar / reanudar | Botón o `Espacio` |
| Reiniciar | Botón o `R` |
| Sumar 50 células | Botón |
| Ver grilla espacial | Botón o `G` |
| Comparar con fuerza bruta | Botón o `B` |
| Mostrar/ocultar nutrientes | Botón o `N` |
| Sembrar nutrientes | Clic o toque en el lienzo |
| Velocidad | Control deslizante (0,25× a 3×) |

El panel de diagnóstico muestra células, FPS, celdas ocupadas de la grilla y comparaciones del último frame.

## Estructura

```
index.html                 # lienzo + panel de controles
css/estilo.css             # estética terminal (verde fósforo)
js/spatial-hash.js         # grilla espacial + versión fuerza bruta (módulo puro)
js/sim.js                  # simulación, dibujo y controles
tests/spatial-hash.test.mjs
favicon.svg
```

`spatial-hash.js` no toca el DOM: se puede importar y testear con Node.

## Correr

No hay build ni dependencias. Alcanza con servir la carpeta (los módulos ES no funcionan desde `file://`):

```bash
npm run serve      # python -m http.server 8000
# o
npx serve .
```

## Tests

```bash
npm test           # node --test, 9 tests
```

Cubren inserción, consultas por radio, bordes de celda, filtros, `clear`, y una comparación de propiedades: la grilla y la fuerza bruta devuelven exactamente el mismo resultado, con muchas menos comparaciones.

## Créditos

Hecho por [Leandro Carlino](https://www.linkedin.com/in/leandro-carlino/).
