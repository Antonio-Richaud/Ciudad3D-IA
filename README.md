# Ciudad3D-IA

Laboratorio experimental de simulación 3D para probar agentes inteligentes, algoritmos de navegación y aprendizaje por refuerzo dentro de una ciudad construida con Three.js.

El proyecto separa deliberadamente el **mundo**, el **agente físico** y su **cerebro** para poder comparar distintos métodos de decisión sin reescribir la simulación.

## Estado actual

Actualmente el proyecto incluye:

- ciudad procedural de 15 x 15 celdas;
- calles, intersecciones, banquetas, cruces peatonales, viviendas y árboles;
- modelos GLB para viviendas, tienda, parque, pizzería y vegetación;
- grafo navegable derivado de la red de calles;
- peatón con Q-Learning tabular;
- automóvil con búsqueda de ruta más corta mediante BFS;
- visualización de la política aprendida;
- cuadrícula de depuración con coordenadas;
- selección y seguimiento de agentes;
- panel de métricas de aprendizaje;
- pruebas automáticas para pathfinding;
- validación continua con GitHub Actions.

## Objetivo del proyecto

La ciudad funciona como un entorno de experimentación para construir y comparar agentes con distintos mecanismos de decisión.

La arquitectura permite evolucionar hacia:

- A* y otros algoritmos clásicos de búsqueda;
- múltiples peatones y vehículos;
- nuevos puntos de interés;
- políticas más complejas;
- redes neuronales y Deep Reinforcement Learning;
- ejecución de modelos mediante WebAssembly;
- simulaciones alimentadas por datos externos;
- visualización y comparación de experimentos.

## Stack

- JavaScript moderno con ES Modules
- Vite
- Three.js
- GLTF / GLB
- Node.js Test Runner para pruebas unitarias
- GitHub Actions para CI

## Requisitos

Se recomienda Node.js 22. El repositorio incluye `.nvmrc`.

Con `nvm`:

```bash
nvm use
```

## Instalación

```bash
git clone https://github.com/Antonio-Richaud/Ciudad3D-IA.git
cd Ciudad3D-IA
npm ci
```

## Desarrollo

```bash
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

## Validación

Ejecutar pruebas:

```bash
npm test
```

Generar build de producción:

```bash
npm run build
```

Ejecutar todas las validaciones locales:

```bash
npm run check
```

## Arquitectura

```text
src/
├── main.js
├── core/
│   └── engine.js
├── city/
│   ├── cityScene.js
│   └── cityVisualSystem.js
├── agents/
│   ├── CarAgent.js
│   ├── WalkerAgent.js
│   ├── pathPlanner.js
│   └── brains/
│       ├── CarShortestPathBrain.js
│       ├── QLearningBrain.js
│       └── ShortestPathBrain.js
├── debug/
│   └── gridOverlay.js
└── visualization/
    └── policyOverlay.js

tests/
├── cityVisualSystem.test.js
└── pathPlanner.test.js
```

### Motor

`src/core/engine.js` encapsula:

- escena;
- renderer;
- cámara;
- OrbitControls;
- iluminación;
- resize;
- loop principal;
- delta time.

El motor no contiene lógica específica de IA o navegación.

### Ciudad

`src/city/cityScene.js` genera el entorno visual y la representación que utilizan los agentes.

La ciudad mantiene un `roadMap` cuya llave tiene el formato:

```text
"gridX,gridZ"
```

Cada celda de calle se convierte así en un nodo del grafo de navegación.

Los principales POIs actuales son:

- `home`
- `shop`
- `park`

Cada POI tiene una `entranceRoad` que actúa como nodo navegable de entrada.

### Agentes y brains

Los agentes controlan representación visual y movimiento.

Los brains controlan decisión.

```text
Agent
  |
  +-- Brain
        |
        +-- chooseNextRoad(currentNode)
```

Esto permite sustituir el algoritmo de decisión sin modificar el movimiento del agente.

### Pathfinding

`src/agents/pathPlanner.js` contiene las utilidades compartidas para trabajar con el grafo de calles y una implementación BFS reutilizada por los brains deterministas.

### Carro

`CarAgent` utiliza `CarShortestPathBrain` para recorrer rutas mínimas entre POIs.

El carro siempre inicia sobre un nodo válido del `roadMap`.

### Peatón

`WalkerAgent` utiliza actualmente `QLearningBrain`.

El estado de Q-Learning es:

```text
(goalId, gridX, gridZ)
```

Las acciones son los nodos de calle adyacentes.

Los parámetros principales son configurables:

- `alpha`
- `gamma`
- `epsilon`
- `epsilonMin`
- `epsilonDecay`
- `goalReward`
- `stepReward`
- `maxEpisodeSteps`

La exploración actual está limitada deliberadamente a un corredor alrededor de casa y tienda para acelerar el aprendizaje durante esta etapa del proyecto.

### Visualización de política

`PolicyOverlay` lee la Q-table y representa la mejor acción aprendida para cada estado mediante indicadores sobre las calles.

La capa existe para poder observar el aprendizaje, no solamente el resultado final.

## Modelos 3D

Los assets utilizados en runtime viven en:

```text
public/models/
```

Actualmente la ciudad carga directamente:

- `casa.glb`
- `casa-grande.glb`
- `tienda.glb`
- `parque.glb`
- `pizzeria.glb`
- `pino.glb`

Por ahora no se generan torres ni edificios procedurales: los lotes ordinarios usan viviendas hasta contar con nuevos modelos de edificios diseñados específicamente para la ciudad.

## Historia conceptual

El proyecto nació inicialmente como una ciudad controlada por datos externos, donde métricas podían modificar propiedades visuales como altura de edificios, color del cielo o intensidad de iluminación.

La arquitectura evolucionó posteriormente hacia simulación de agentes y aprendizaje por refuerzo. La función `applyCityState()` se conserva porque esa línea de desarrollo puede volver a integrarse en el futuro sin mezclarla con la lógica de agentes.

## Flujo recomendado de desarrollo

1. Crear una branch desde `main`.
2. Implementar el cambio.
3. Ejecutar `npm run check`.
4. Revisar visualmente con `npm run dev`.
5. Abrir Pull Request.
6. Mergear únicamente con CI en verde.

## Principios del repositorio

- `main` debe permanecer estable.
- Los algoritmos de decisión deben vivir fuera de los agentes.
- El grafo de navegación debe tener una sola fuente de verdad.
- Los assets experimentales no deben mezclarse con los assets usados en runtime.
- Cada cambio de lógica debe incluir pruebas cuando sea razonable.
- Las optimizaciones no deben alterar silenciosamente el comportamiento esperado de la simulación.

## Roadmap inmediato

- separar configuración de simulación de `main.js`;
- formalizar episodios de entrenamiento y reset del entorno;
- crear un grafo peatonal independiente de la red vehicular;
- añadir pruebas para brains;
- persistir y restaurar Q-tables;
- integrar nuevos POIs y escenarios;
- preparar benchmarking entre algoritmos;
- evaluar A*, DQN y modelos neuronales.

---

Desarrollado por Antonio Richaud.
