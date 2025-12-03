# 🏙️ Ciudad3D-IA

Proyecto experimental para construir una **ciudad 3D en Three.js** que sirva como _playground_ para **agentes inteligentes** (coches, peatones, futuros agentes con redes neuronales y RL).

---

## 🎯 Idea general

- Tener una **ciudad sencilla pero estética**.
- Añadir **agentes** (carrito, muñequito).
- Definir **lugares importantes (POIs)**: casa, tienda, etc.
- Probar distintos **“cerebros”** para los agentes:
  - Camino más corto (BFS / A*).
  - Q-Learning tabular.
  - Más adelante: redes neuronales / Rust + WASM.

---

## 🧱 Stack

- **Vite** + JavaScript.
- **Three.js** para la escena 3D.
- Modelos `.glb` de **casa** y **tienda** (hechos en Blender).
- Arquitectura modular en `src/`:
  - Motor → `core/engine.js`
  - Ciudad → `city/cityScene.js`
  - Agentes y cerebros → `agents/`

---

## 🚀 Cómo correr el proyecto

```bash
# instalar dependencias
npm install

# levantar servidor de desarrollo
npm run dev
```

Luego abre el navegador en la URL que te diga Vite (normalmente `http://localhost:5173`).

---

## 📁 Estructura del proyecto

```text
Ciudad3D-IA/
  public/
    models/
      casa.glb        # Casa del muñequito
      tienda.glb      # Tienda / comercio

  src/
    main.js
    core/
      engine.js
    city/
      cityScene.js
    agents/
      CarAgent.js
      WalkerAgent.js
      pathPlanner.js
      brains/
        ShortestPathBrain.js
```

---

## 🏡 Modelos 3D (`public/models/`)

Aquí viven los modelos `.glb` que se cargan con `GLTFLoader`:

- `casa.glb` → se coloca en una manzana específica y se marca como POI `"home"`.
- `tienda.glb` → ocupa una manzana y media aprox., marcada como POI `"shop"`.

Rutas usadas en el código:

```js
const HOUSE_MODEL_URL = "/models/casa.glb";
const SHOP_MODEL_URL  = "/models/tienda.glb";
```

---

## ⚙️ Motor (`core/engine.js`)

Responsable de:

- Crear `renderer`, `scene`, `camera` y `clock`.
- Manejar el **loop de animación** (`onUpdate`, `start()`).
- Ajustar el canvas al tamaño del contenedor.

`createEngine(container)` devuelve un objeto con:

- `scene`
- `camera`
- `renderer`
- `onUpdate(callback)`
- `start()`

---

## 🏗️ Ciudad (`city/cityScene.js`)

Módulo principal que construye la ciudad y devuelve un objeto `city` con toda la info necesaria para los agentes.

### Elementos principales

- **Grid** de tamaño `gridSize x gridSize` (ej. `15 x 15`).
- **Calles**:
  - Distribuidas en patrón tipo “parrilla”.
  - Cada celda de calle se registra en `city.roadMap` usando keys `"x,z"`.
- **Texturas de calles**:
  - Tramo normal → línea discontinua blanca.
  - Intersecciones → asfalto limpio (los pasos peatonales se generan con geometría aparte).
- **Banquetas**:
  - Creadas como `BoxGeometry` alrededor de las manzanas.
  - Altura baja (`sidewalkHeight`).
  - Registradas en `city.sidewalks`.
- **Acera perimetral**:
  - Banqueta que rodea todo el mapa.
  - Sirve como “límite visual”.

### Edificios procedurales

En cada manzana que **no es calle** y **no está reservada**:

- Se genera un edificio tipo `tower` (zona centro) o `house` (zona suburbio).
- Altura aleatoria dentro de un rango.
- Material con textura de ventanas pintada en un `<canvas>`.

Cada edificio se registra en `city.buildings` con:

- `id`, `type`, `capacity`, `baseHeight`, `gridX`, `gridZ`.

### Árboles 🌳

- Grupos low-poly (tronco + copa).
- Colocados en esquinas de la manzana, evitando chocar con edificios y banquetas.
- Registrados en `city.trees`.

---

## ⭐ Modelos especiales: casa y tienda

En la parte superior del archivo se define:

```js
const SPECIAL_LOTS = [
  {
    id: "home",
    label: "Casa",
    modelUrl: HOUSE_MODEL_URL,
    buildingCell: { gridX: 4, gridZ: 7 },
    entranceRoad: { gridX: 3, gridZ: 7 },
    scale: 1.2,
    rotationY: Math.PI / 2,
    capacity: 4,
  },
  {
    id: "shop",
    label: "Tienda",
    modelUrl: SHOP_MODEL_URL,
    buildingCell: { gridX: 10, gridZ: 7 },
    entranceRoad: { gridX: 9, gridZ: 7 },
    scale: 0.75,
    rotationY: Math.PI,
    capacity: 10,
    extraCells: [
      { gridX: 11, gridZ: 7 }, // manzana adicional que queda “reservada”
    ],
  },
];
```

Reglas:

- En `buildingCell` **NO** se genera edificio procedural; se carga el modelo `.glb`.
- En `extraCells` tampoco hay edificios; es espacio libre visual.
- `entranceRoad` indica en qué celda de calle está la **entrada peatonal**.

Al final, `createCity(scene)` devuelve algo como:

```js
{
  ground,
  roads,
  sidewalks,
  perimeterSidewalks,
  crosswalks,
  buildings,
  trees,
  roadMap,
  pointsOfInterest,   // { home: { ... }, shop: { ... } }
  gridSize,
  cellSize,
  sidewalkWidth,
  sidewalkOffset,
}
```

---

## 🟨 Pasos peatonales

Los pasos cebra amarillos se generan como geometría 3D (no en la textura):

- Grupos de cajas finas (`BoxGeometry`) colocadas sobre el asfalto.
- Generados alrededor de las intersecciones, sobre los tramos de calle que llegan al cruce.
- Se guardan en `city.crosswalks` (útil para debug/overlays futuros).

---

## 🤖 Agentes (`agents/`)

### 🚗 `CarAgent.js`

- Agente sencillo que se mueve por las calles, girando en intersecciones.
- Lógica aleatoria pero respetando el grafo de `roadMap`.
- Visualmente: coche low-poly.
- Por ahora **no está conectado** a ningún brain de IA (solo da vida a la ciudad).

### 🧍‍♂️ `WalkerAgent.js`

El protagonista humanoide.

**Responsabilidades:**

- Caminar sobre banquetas alrededor de las calles.
- Pedir al **cerebro (brain)** el siguiente nodo de calle al que debe ir.
- Interpolar suavemente entre posiciones en mundo.

**Estado interno:**

- `currentRoadNode` → nodo de calle actual `{ gridX, gridZ }`.
- `targetRoadNode` → nodo objetivo del segmento.

**Métodos clave:**

- `update(dt)` → actualiza animación y movimiento.
- `setGoal(goalId)` → configura la ruta hacia `"home"` o `"shop"`.
- `getCurrentRoadNode()`
- `getWorldPosition()`
- `isAtRoadNode(node)`
- `isAtPOI(poi)` → compara con `poi.entranceRoad`.

La dirección de movimiento por segmento se define así:

1. El brain devuelve el siguiente nodo de calle.
2. `_startNextSegment()`:
   - Usa la posición actual como inicio.
   - Calcula la posición objetivo sobre la banqueta del nodo destino.
   - Ajusta la rotación del muñequito hacia la dirección de movimiento.
   - Calcula duración según distancia y `speed`.

---

## 🧠 Pathfinding y cerebros (`agents/pathPlanner.js` + `agents/brains/`)

### `pathPlanner.js`

Utilidades sobre el grafo de calles:

- `roadKey(gridX, gridZ)` → `"x,z"`.
- `hasRoadAt(city, gridX, gridZ)` → `boolean`.
- `getNeighbors(city, node)` → vecinos de calle (N, S, E, O).
- `sameNode(a, b)` → compara nodos.

**`bfsPath(city, start, goal)`**

- Implementa **BFS** (búsqueda en anchura).
- Devuelve un arreglo de nodos desde `start` hasta `goal` (incluyendo ambos).
- Si no hay camino, devuelve `null`.

### `brains/ShortestPathBrain.js`

Primer “cerebro” del muñequito:

- Usa `bfsPath` para encontrar el camino más corto entre:
  - Nodo actual del agente.
  - `entranceRoad` del POI objetivo (`home`, `shop`, etc.).

**Estado interno:**

- `currentGoalId` → `"home"` o `"shop"`.
- `currentPath` → lista de nodos de la ruta.
- `pathIndex` → índice actual dentro de la ruta.

**Métodos:**

- `setGoal(goalId, startNode)`:
  - Calcula ruta `startNode → poi[goalId].entranceRoad`.
- `chooseNextRoad(currentNode)`:
  - Devuelve el siguiente nodo de la ruta.
  - Si el agente se sale de la ruta, la recalcula desde su posición actual.
- `getDebugInfo()`:
  - Info para overlays futuros (ruta, meta, etc.).

---

## 🎛️ Orquestador: `src/main.js`

Punto de entrada de la app.

**Responsabilidades:**

- Crear el motor (`engine`) y la ciudad (`city`).
- Aplicar estado visual inicial (cielo, altura de edificios, glow).
- Instanciar agentes:
  - `CarAgent` (carrito).
  - `WalkerAgent` + `ShortestPathBrain`.
- Manejar el bucle de actualización:
  - Llamar `update(dt)` en todos los agentes.
  - Detectar cuándo el muñequito llega a un POI.
  - Cambiar la meta (casa ↔ tienda).
  - Actualizar el HUD.

### HUD actual

Muestra:

- Objetivo actual del muñequito.
- Cuántas veces ha llegado a la tienda y a casa.

Se actualiza cada que el agente completa su tarea.

---

## 🧪 Roadmap de IA

**Brain clásico listo:**

- `ShortestPathBrain` + `pathPlanner` → rutas óptimas Casa ↔ Tienda.

**Siguiente paso: Q-Learning**

Implementar `QLearningBrain`:

- Estado = `(gridX, gridZ, goalId)`.
- Acciones = `N`, `S`, `E`, `O`.
- Reward:
  - `+R` al llegar al objetivo.
  - `-r` por cada paso.

Visualización de valores Q:

- Flechas de colores sobre el nodo actual.
- Panel flotante con Q-values y reward.

**Más adelante:**

- Reemplazar tabla `Q` por red neuronal (JS o Rust+WASM).
- Añadir más POIs (parque, trabajo, etc.).
- Múltiples agentes con comportamientos distintos.

---

## 📝 Notas varias

- El warning de color se corrige usando un hex de 6 dígitos: `#5f9df3`.
- El 404 de `favicon.ico` es irrelevante para el funcionamiento.
- Toda la parte “durote” de IA (Q-learning, NN) se montará respetando:
  - La interfaz de `WalkerAgent` (sigue preguntando a `brain`).
  - La estructura de `city` (`roads`, `POIs`, etc.).