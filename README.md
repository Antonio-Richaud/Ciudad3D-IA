# Ciudad 3D controlada por datos reales

Proyecto experimental para visualizar datos en tiempo real a través de una ciudad 3D construida con **Three.js** y tecnologías web modernas.

---

## Objetivos del proyecto

- Construir una ciudad 3D sencilla (edificios, calles, autos) usando **Three.js**.
- Mapear métricas de datos reales a propiedades visuales:
  - Altura de edificios = valor de una métrica (precio de cripto, visitas web, etc.).
  - Color del cielo = estado del mercado (bull, bear, neutro).
  - Tráfico / luces = volumen de transacciones o usuarios.
- Cambiar la fuente de datos (APIs de criptos, clima, analítica web, datos simulados) sin reescribir todo el motor.

---

## Arquitectura (versión inicial)

- `core/`: motor 3D (escena, cámara, renderer, loop).
- `city/`: construcción de la ciudad (edificios, calles, tráfico, cielo).
- `data/`: capa de datos (APIs, datos dummy, normalización).
- `scenes/`: presets y animaciones de cámara para grabar videos.
- `config/`: mapeos de datos → visual (rangos, colores, etc.).

Esta estructura se irá afinando conforme avance el desarrollo.

---

## Roadmap

1. **Fase 1 – Ciudad estática básica**
   - Escena, cámara, luces y una ciudad sencilla sin conexión a datos.

2. **Fase 2 – Datos dummy**
   - Integrar una capa de datos falsos que mueva la ciudad (alturas, colores, tráfico).

3. **Fase 3 – APIs reales**
   - Conectar con APIs de criptomonedas, clima u otras fuentes.

4. **Fase 4 – Modo “cinematográfico”**
   - Rutas de cámara, transiciones, efectos visuales listos para TikTok/Reels.

---

## Requisitos (previstos)

- Node.js (para el entorno de desarrollo y bundler).
- Navegador moderno con soporte para WebGL.

> La configuración de herramientas (Vite, dependencias, scripts) se documentará más adelante conforme se implemente.
