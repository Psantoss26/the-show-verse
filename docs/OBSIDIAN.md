---
tags: [type/guia, area/home]
aliases: [Cómo abrir en Obsidian, Vista neuronal, Graph view]
---
# 🧠 Abrir y visualizar la documentación en Obsidian

> Cómo abrir este proyecto como **vault** y ver la **vista neuronal** (Graph view)
> de todas las secciones y archivos. La configuración ya viene lista en `.obsidian/`.

## 1. Instalar Obsidian
Descárgalo de [obsidian.md](https://obsidian.md) (gratis para uso personal). Linux, macOS y Windows.

## 2. Abrir el repositorio como vault
El **vault es la raíz del proyecto** (la carpeta `the-show-verse/`), no `docs/`.
Así el grafo incluye también los README repartidos por el proyecto (`backend/`,
`android-companion/`, `netflix-extension/`, `deploy/`).

1. Abre Obsidian → **"Open folder as vault"** (Abrir carpeta como almacén).
2. Selecciona la carpeta raíz del proyecto: `the-show-verse/`.
3. Si Obsidian pregunta por confiar en la configuración del `.obsidian/`, acepta
   ("Trust author and enable plugins"). Ya trae Graph view y Backlinks activados.

> **Nota:** todo lo que empieza por punto (`.next/`, `.git/`, `.claude/`, `.superpowers/`…)
> Obsidian lo oculta automáticamente. La documentación vive en `docs/` (sin punto)
> justo para que sea visible aquí.

## 3. Empezar a navegar
- Abre **[[Home]]**: es el mapa central. Desde ahí llegas a cada sección ([[Frontend]],
  [[Backend]], [[Infrastructure]], etc.).
- `Ctrl/Cmd + O`: saltador rápido entre notas.
- En cualquier nota, mira el panel **Backlinks** (abajo/derecha) para ver qué la enlaza.

## 4. Ver la "vista neuronal" (Graph view)
- **Grafo global:** icono de grafo en la barra lateral izquierda, o
  `Ctrl/Cmd + P` → "Open graph view". Verás toda la red de documentos.
- **Grafo local** (de una nota): `Ctrl/Cmd + P` → "Open local graph". Muestra solo
  los vecinos de la nota abierta; sube la profundidad ("depth") para ver más saltos.

### Ya viene configurado
La carpeta `.obsidian/` incluye (`graph.json`, `app.json`):
- **Filtro anti-ruido:** `node_modules`, `.next`, `coverage`… quedan fuera del grafo
  (hay >1300 `.md` dentro de `node_modules` que si no lo contaminarían).
- **Grupos de color por sección:** frontend, backend, infraestructura, guías,
  arquitectura, planning, superpowers, agentes, TFG y apps companion, cada una con su color.

### Ajustar el grafo (panel de la derecha en Graph view)
- **Filters → Search:** ya trae `-path:node_modules …`. Puedes añadir `-tag:#type/spec`, etc.
- **Groups:** los grupos de color son editables; se guardan en `.obsidian/graph.json`.
- **Forces:** sube *Repel force* y *Link distance* para "abrir" la red; *Center force*
  para agruparla. *Text fade* controla cuándo aparecen las etiquetas.
- **Display → Tags:** actívalo para que los `#tags` aparezcan como nodos y agrupen temas.

## 5. Colorear por etiquetas (opcional)
Las notas nuevas llevan `tags` en su frontmatter (`#area/frontend`, `#type/guia`…).
Puedes crear grupos de color en el grafo por `tag:#area/frontend` además de por ruta.
El panel **Tags** (core plugin) lista todas las etiquetas del vault.

## Relacionado
- [[Home]]
- [[Frontend]]
- [[Backend]]
