# Plan de Optimización de Recursos de Vercel

## Resumen

Optimizar la app para que Vercel deje de asumir trabajo que puede hacer el navegador, TMDb directamente o el backend Railway. El objetivo es reducir consumo en Function Invocations, Fluid Active CPU, Image Optimization, Fast Origin Transfer y Edge Requests antes de escalar a más usuarios o monetización.

## Cambios clave

- Reducir Image Optimization de Vercel para posters y backdrops de TMDb.
- Usar URLs directas de TMDb con tamaños adecuados (`w342`, `w500`, `w780`, `w1280`, `original`) mediante `<img>` o `OptimizedImage`.
- Reservar `next/image` solo para imágenes críticas donde la transformación compense.
- Mover rutas API pesadas de Next a Fastify/Railway, especialmente dashboards, historial, progreso, ratings, favoritos, watchlist, recomendaciones y estados de item.
- Consolidar respuestas de dashboards para que el cliente haga menos peticiones separadas.
- Aumentar uso de caché backend/Redis para datos ya ensamblados.
- Evitar self-fetch desde páginas server-side hacia API routes internas de Next cuando pueda usarse una función local o el backend directamente.
- Limitar `router.prefetch` y precargas de hover/tráilers a elementos visibles o intención real del usuario.
- Revisar `middleware.js` para que no procese rutas, assets o APIs donde no sea necesario.

## Test plan

- Verificar que el archivo existe en `docs/vercel-resource-optimization-plan.md`.
- Revisar que el Markdown se renderiza correctamente.
- Medir antes/después en Vercel: Function Invocations, Fluid Active CPU, Image Optimization, Fast Origin Transfer y Edge Requests.
- Validar navegación en Inicio, Películas, Series, Details, Profile e History.
- Validar usuario anónimo, usuario autenticado, recarga directa de MainDashboard, caché fría y caché caliente.
- No requiere tests de código para este cambio porque es documentación.

## Assumptions

- El frontend se mantiene en Vercel a corto plazo.
- Railway/Fastify será el backend principal para trabajo pesado.
- La prioridad inicial es reducir coste y uso sin rediseñar la app.
- Si tras estas optimizaciones siguen apareciendo límites, el siguiente paso recomendado será pasar a Vercel Pro con alertas de gasto.
