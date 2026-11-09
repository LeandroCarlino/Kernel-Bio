# Kernel Bio

Simulación de células en un medio con nutrientes. Cada célula busca comida, gasta energía, se divide si está bien alimentada y muere si se queda sin nada. Para encontrar vecinas usa una **grilla espacial (spatial hashing)**, y la interfaz permite comparar en vivo contra **fuerza bruta**.

**Demo:** https://leandrocarlino.github.io/Kernel-Bio/

## Por qué spatial hashing

Si cada célula se compara contra todas las demás, el costo por frame crece al cuadrado: con 700 células son **490.000** comparaciones. La grilla divide el plano en celdas de 48 px y solo revisa las que tocan el radio de visión de cada célula: con las mismas 700, unas **9.700**.

El panel muestra las dos curvas en un gráfico en vivo y el factor de diferencia. El botón **Fuerza bruta** cambia el modo para comprobarlo de verdad, no en teoría.

## Inspector

Pasá el mouse sobre el lienzo: se resalta la célula más cercana, su **radio de visión** y las celdas de la grilla que visita. El panel indica cuántas celdas tocó, cuántas distancias evaluó y cuántas vecinas encontró.

Un clic sobre una célula la **selecciona** (energía, edad y velocidad). Un clic en el vacío **siembra nutrientes** en esa zona.

## Escenarios

| Escenario | Qué cambia |
|---|---|
| **Colonias** | Equilibrio: nutrientes normales y células que forman colonias |
| **Escasez** | Casi no hay comida; sobreviven las que encuentran restos |
| **Plaga** | Comida abundante y metabolismo barato: la población explota |
| **Caza** | Aparecen **depredadores** que persiguen células. Sin presas, mueren |

El escenario y la población quedan en la URL (`?preset=caza&n=300`), así que se puede compartir una configuración exacta.

## Cómo funciona la simulación

Cada célula tiene posición, velocidad, energía y edad:

1. **Separación**: si dos células están muy cerca, se empujan.
2. **Cohesión suave**: tienden a formar colonias sin pegarse.
3. **Quimiotaxis**: suben el gradiente de nutrientes.
4. **Huida**: si hay un depredador cerca, la fuerza de escape pesa más que el resto.
5. **Metabolismo**: pierden energía con el tiempo y con la distancia recorrida.
6. **División**: al superar el umbral, y si no están apiñadas, se dividen.
7. **Muerte**: cuando la energía llega a cero, desaparecen.

Los depredadores usan una **segunda grilla**: buscan la presa más cercana dentro de su radio, la comen y ganan energía; si no cazan, mueren. También se dividen cuando están bien alimentados.

## Controles

| Acción | Cómo |
|---|---|
| Pausar / reanudar | Botón o `Espacio` |
| Reiniciar | Botón o `R` |
| Sumar 50 células | Botón |
| Ver grilla espacial | Botón o `G` |
| Comparar con fuerza bruta | Botón o `B` |
| Mostrar/ocultar nutrientes | Botón o `N` |
| Deseleccionar | `Esc` |
| Sembrar nutrientes | Clic o toque en el vacío |
| Seleccionar célula | Clic sobre una célula |
| Velocidad | Control deslizante (0,25× a 3×) |

## Estructura

```
index.html                 # lienzo + panel
css/estilo.css             # estética terminal
js/spatial-hash.js         # grilla + fuerza bruta (sin DOM)
js/mundo.js                # simulación pura: células, depredadores, nutrientes
js/config.js               # parámetros, escenarios y lectura de la URL
js/sim.js                  # canvas, inspector, gráfico y controles
tests/                     # 18 tests con node --test
favicon.svg
```

La lógica está separada del DOM: `mundo.js` recibe el generador aleatorio por parámetro, así los tests son deterministas.

## Correr

```bash
npm run serve      # python -m http.server 8000
# o
npx serve .
```

## Tests

```bash
npm test           # node --test, 18 tests
```

Cubren la grilla (inserción, radios, bordes de celda, filtros, `clear`, equivalencia con fuerza bruta) y la simulación (división, muerte, depredadores, siembra de nutrientes, inspección sin contaminar métricas).

## Créditos

Hecho por [Leandro Carlino](https://www.linkedin.com/in/leandro-carlino/).
