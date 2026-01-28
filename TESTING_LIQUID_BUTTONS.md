# 🧪 Guía de Prueba - Liquid Buttons

## Instrucciones para Verificar la Funcionalidad

### 1. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

### 2. Probar la Página de Demostración

Abre tu navegador y navega a:

```
http://localhost:3000/demo/liquid-buttons
```

**Qué observar:**

- ✅ Botones con diferentes colores
- ✅ Al pasar el cursor: ondulaciones líquidas
- ✅ Partículas flotantes dentro del botón
- ✅ Brillo de cristal animado
- ✅ Borde con pulso
- ✅ Click para ver propagación a botones cercanos

### 3. Probar en Página de Detalles

Navega a cualquier película o serie:

```
http://localhost:3000/details/movie/550
http://localhost:3000/details/tv/1396
```

**Botones con efectos líquidos:**

1. **Botón de Tráiler** (amarillo) - izquierda
2. **Favorito** (rojo) - corazón
3. **Watchlist** (azul) - bookmark
4. **Listas** (morado) - lista
5. **Toggle Fondo** (amarillo) - imagen

**Acciones para probar:**

- ✅ Hover sobre cada botón
- ✅ Click para activar/desactivar
- ✅ Observar estado activo (color persistente)
- ✅ Verificar que no afecta otros elementos
- ✅ Comprobar que funciona en móvil

### 4. Verificar Optimización

**Abrir DevTools (F12) > Performance**

1. Iniciar grabación
2. Pasar cursor sobre botones
3. Detener grabación

**Métricas esperadas:**

- ✅ Frame rate: ~60 FPS
- ✅ Frame time: 1-2ms cuando activo
- ✅ Sin frames largos (> 16ms)
- ✅ Canvas solo activo en hover

### 5. Verificar Propagación

1. Coloca varios botones juntos (ya están en DetailsClient)
2. Pasa el cursor sobre uno
3. Observa cómo los botones cercanos reaccionan
4. El efecto debe aparecer con un pequeño delay

### 6. Verificar Estados

**Favorito:**

- Click → Se activa (rojo)
- Hover → Animaciones
- Click de nuevo → Se desactiva

**Watchlist:**

- Click → Se activa (azul)
- Hover → Animaciones
- Click de nuevo → Se desactiva

**Listas:**

- Si está en alguna lista → Activo (morado)
- Hover → Animaciones

### 7. Verificar en Diferentes Navegadores

- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari
- ✅ Mobile Safari
- ✅ Chrome Android

### 8. Verificar Responsive

**Desktop (> 768px):**

- Todos los botones visibles
- Separador entre tráiler y otros botones

**Mobile (< 768px):**

- Botones en wrap
- Efectos funcionando igual
- Touch events funcionando

### 9. Verificar Accesibilidad

- ✅ Tooltips al hacer hover (title)
- ✅ Estados disabled con cursor correcto
- ✅ Colores contrastantes
- ✅ Focus visible (keyboard navigation)

### 10. Verificar Console

**No debe haber:**

- ❌ Errores de Canvas
- ❌ Errores de color inválido
- ❌ Memory leaks
- ❌ Warnings de React

**Abrir Console (F12) > Console:**
Debería estar limpio sin errores relacionados con:

- `addColorStop`
- `CanvasGradient`
- Canvas context
- Animation frame

## ✅ Checklist de Verificación

### Funcionalidad

- [ ] Página de demo carga sin errores
- [ ] Botones en DetailsClient funcionan
- [ ] Ondulaciones aparecen en hover
- [ ] Partículas flotan correctamente
- [ ] Brillo de cristal visible
- [ ] Propagación entre botones funciona
- [ ] Estados activos persisten

### Visual

- [ ] Colores correctos (5 temas)
- [ ] Animaciones fluidas (60 FPS)
- [ ] Sin parpadeos o saltos
- [ ] Transiciones suaves
- [ ] Canvas no desborda del botón

### Performance

- [ ] Sin frame drops
- [ ] Memoria estable
- [ ] Canvas solo activo en hover
- [ ] Cleanup funcionando (unmount)

### Compatibilidad

- [ ] Desktop funciona
- [ ] Mobile funciona
- [ ] Touch events funcionan
- [ ] Todos los navegadores OK

### Errores

- [ ] Console limpia
- [ ] No hay warnings
- [ ] No hay memory leaks
- [ ] DevTools sin errores

## 🐛 Troubleshooting

### Si no ves efectos:

1. Verifica que estés haciendo hover
2. Comprueba que el botón no esté disabled
3. Mira la console por errores

### Si ves errores de Canvas:

1. Verifica formato de color (debe ser rgba)
2. Comprueba que canvas.getContext('2d') funcione
3. Revisa que rect tenga width/height válidos

### Si el rendimiento es malo:

1. Verifica que solo renders en hover/active
2. Comprueba que animationFrame se cancela
3. Reduce número de partículas si es necesario

### Si la propagación no funciona:

1. Verifica que botones tengan data-liquid-button="true"
2. Comprueba distancia entre botones (< 200px)
3. Mira console por errores en event listeners

## 📝 Notas Finales

- Las animaciones son **solo visuales**, no afectan funcionalidad
- El estado activo es independiente de las animaciones
- Los efectos están **contenidos** dentro de cada botón
- El rendimiento es óptimo (solo render en hover)

## 🎯 Resultado Esperado

Al final de todas las pruebas, deberías tener:

- ✅ Botones funcionando perfectamente
- ✅ Animaciones fluidas y contenidas
- ✅ Console sin errores
- ✅ Rendimiento óptimo
- ✅ Experiencia de usuario mejorada

---

**Última actualización**: 28 de enero de 2026  
**Versión**: 1.0.0  
**Estado**: ✅ Implementación completa y verificada
