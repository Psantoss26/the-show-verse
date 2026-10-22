# The Show Verse Agent Guidance

This project uses Chrome for Developers Modern Web Guidance.

Before implementing UI, CSS, HTML, accessibility, client-side interaction, animation, image loading, or frontend performance work, consult the installed Modern Web Guidance CLI:

```sh
npm run mw:search -- "<task description>"
```

Then retrieve the relevant guide:

```sh
npm run mw:retrieve -- "<guide-id>"
```

Project Baseline target: Baseline 2024.

Use modern platform features when they meet this target. For newer or limited-availability features, prefer progressive enhancement and feature detection, and avoid adding polyfills or dependencies unless the benefit is clear for this app.

For Next.js web development assistance, use the local agent profile at:

```sh
docs/agents/nextjs-web-agent.md
```

For backend Node.js, Fastify, PostgreSQL/Neon, Redis, Drizzle, Railway deployment,
and frontend-backend integration work, use the local agent profile at:

```sh
docs/agents/backend-node-fastify-agent.md
```

## Documentación (obligatorio en cada cambio)

Todo cambio que añada, quite o modifique algo visible para el usuario, una ruta de `src/app`, un endpoint de `backend/src/routes` o una variable de entorno debe actualizar la documentación **en el mismo commit o PR**:

1. Añade una línea en `CHANGELOG.md`, sección *Sin publicar* (o el mes en curso), en castellano y desde el punto de vista del usuario.
2. Actualiza el documento afectado:
   - endpoint del backend → `docs/backend/backend_api_reference.md`;
   - página o ruta de API de Next → `docs/frontend/app-router-pages.md`;
   - funcionalidad → su documento en `docs/features/` (o crea uno y enlázalo en `docs/features/Features.md`);
   - variable de entorno → `.env.example` y la guía de infraestructura correspondiente.
3. Si cierra o abre trabajo planificado, actualiza `docs/ROADMAP.md`.
4. Los documentos nuevos siguen el formato del vault de Obsidian: `tags` en el frontmatter y sección *Relacionado* con `[[wikilinks]]`.

Los cambios puramente internos (refactor sin efecto visible, estilos menores, tests) no necesitan entrada en el changelog.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
