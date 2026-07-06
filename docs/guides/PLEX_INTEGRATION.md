# Integración con Plex

## Descripción

Esta aplicación incluye integración con tu servidor local de Plex para mostrar automáticamente qué películas y series tienes disponibles en tu biblioteca personal. Cuando una película o serie está disponible en tu servidor Plex, verás el logo de Plex con un indicador verde en la sección de plataformas de streaming.

## Características

- ✅ **Detección automática**: Busca automáticamente si una película o serie está en tu biblioteca de Plex
- ✅ **Acceso directo**: Haz clic en el logo de Plex para abrir directamente el contenido en Plex Web
- ✅ **Indicador visual**: Punto verde 🟢 en la esquina superior del logo cuando está disponible
- ✅ **Caché inteligente**: Los resultados se almacenan en caché por 24 horas para mejorar el rendimiento
- ✅ **Coincidencia inteligente**: Usa título, año y ID de IMDB para encontrar las coincidencias más precisas
- ✅ **Soporte completo**: Funciona con películas y series, respetando la estructura de bibliotecas de Plex
- ✅ **URLs correctas**: Genera URLs directas a los detalles del contenido en Plex Web

## Configuración

### 1. Obtener tu Token de Plex

Para que la aplicación pueda comunicarse con tu servidor Plex, necesitas un token de autenticación:

**Método 1: Desde Plex Web**
1. Abre [app.plex.tv](https://app.plex.tv) en tu navegador
2. Inicia sesión en tu cuenta de Plex
3. Abre cualquier película o serie
4. Haz clic derecho en el reproductor y selecciona "Get Info" o "Ver XML"
5. En la URL que aparece, busca el parámetro `X-Plex-Token=`
6. Copia el valor que aparece después del igual

**Método 2: Desde la documentación oficial**
Sigue la guía oficial de Plex: [Finding an authentication token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

### 2. Configurar Variables de Entorno

Crea o edita el archivo `.env` o `.env.local` en la raíz del proyecto:

```bash
# URL de tu servidor Plex
# Puede ser:
# - Servidor local: http://localhost:32400
# - IP local: http://192.168.1.100:32400
# - URL de Plex Direct: https://xxx-xxx-xx-xx.xxxxx.plex.direct:xxxxx
PLEX_URL=https://90-170-96-44.f3580c34e4b24e42bddab70a8fe891a5.plex.direct:14466

# Token de autenticación de Plex (obtén el tuyo siguiendo las instrucciones)
PLEX_TOKEN=tu_token_aqui
```

**Notas:**
- Usa la URL exacta de tu servidor Plex (puede incluir el puerto si es diferente a 32400)
- Si usas Plex Direct (URLs con `.plex.direct`), usa la URL completa con HTTPS y el puerto
- El token debe ser el mismo para todo tu servidor, independientemente de las bibliotecas

### 3. Reiniciar el Servidor de Desarrollo

Después de configurar las variables de entorno, reinicia el servidor:

```bash
npm run dev
```

## Cómo Funciona

### Flujo de Búsqueda

1. Cuando accedes a los detalles de una película o serie, la aplicación consulta automáticamente tu servidor Plex
2. La búsqueda utiliza:
   - **Título**: Busca coincidencias exactas o parciales
   - **Año**: Verifica que el año coincida (con margen de ±1 año)
   - **IMDB ID**: Si está disponible, lo usa para mayor precisión
   - **Tipo de contenido**: Diferencia entre películas (`movie`) y series (`tv`)
3. Para series, limpia automáticamente las rutas `/children` para acceder a los detalles correctos
4. Si encuentra una coincidencia, muestra el logo de Plex con el punto verde
5. Al hacer clic en el logo, te lleva directamente al contenido en Plex Web con la URL correctamente formateada

### Caché

Los resultados se almacenan en `sessionStorage` durante 24 horas para:
- ✅ Reducir llamadas al servidor Plex
- ✅ Mejorar el tiempo de carga
- ✅ Reducir el uso de red local

El caché se limpia automáticamente después de 24 horas o al cerrar el navegador.

## Indicadores Visuales

Cuando un contenido está disponible en Plex, verás:

- 🟢 **Punto verde**: Círculo verde en la esquina superior derecha del logo de Plex
- 🎯 **Posición**: Aparece al final de la lista de plataformas de streaming
- 🎨 **Estilo consistente**: El logo de Plex tiene el mismo diseño que las demás plataformas (Netflix, Prime Video, etc.)
- ✨ **Hover effect**: Al pasar el ratón sobre el logo, se amplía ligeramente igual que las otras plataformas
- 📱 **Tooltip**: Al pasar el ratón, muestra "Disponible en tu servidor local"

## Solución de Problemas

### El logo de Plex no aparece

**Verificar configuración:**
```bash
# En tu terminal, verifica que las variables estén configuradas
echo $env:PLEX_URL
echo $env:PLEX_TOKEN
```

**Verificar acceso al servidor:**
- Abre tu navegador y visita `http://localhost:32400/web`
- Si no carga, verifica que Plex Media Server esté ejecutándose

### El logo aparece pero no abre Plex correctamente

**Para películas:**
- Verifica que el token sea correcto
- Comprueba que tengas permisos para acceder a la biblioteca de películas

**Para series que se quedan cargando:**
- Verifica que la URL generada NO incluya `/children` al final
- Revisa los logs del servidor, deberías ver:
  ```
  [Plex] Removing /children from key for TV show: /library/metadata/1526/children
  [Plex] Cleaned key: /library/metadata/1526
  [Plex] Encoded key: %2Flibrary%2Fmetadata%2F1526
  ```
- Limpia el caché del navegador completamente
- Reinicia el servidor de desarrollo

**Problemas generales:**
- Revisa la consola del navegador (F12) para ver errores
- Verifica que la URL de tu servidor Plex sea correcta (con puerto y protocolo)
- Asegúrate de que el token sea el mismo que aparece en las URLs de "View XML" de Plex

### Búsquedas lentas

- Normal en la primera búsqueda (no hay caché)
- Si es consistentemente lento, verifica la conexión de red local
- Considera usar una IP fija en lugar de localhost

## API Endpoint

La integración usa el endpoint `/api/plex` que acepta:

**Parámetros:**
- `title` (requerido): Título de la película o serie
- `type` (requerido): `movie` o `tv`
- `year` (opcional): Año de lanzamiento
- `imdbId` (opcional): ID de IMDB para mayor precisión

**Ejemplo para películas:**
```
GET /api/plex?title=Inception&type=movie&year=2010&imdbId=tt1375666
```

**Ejemplo para series:**
```
GET /api/plex?title=Normal+People&type=tv&year=2020&imdbId=tt9059760
```

**Respuesta exitosa:**
```json
{
  "available": true,
  "plexUrl": "https://your-server.plex.direct:14466/web/index.html#!/server/a946784.../details?key=%2Flibrary%2Fmetadata%2F1526",
  "title": "Normal People",
  "year": 2020,
  "ratingKey": "1526",
  "thumb": "https://your-server.plex.direct:14466/library/metadata/1526/thumb?X-Plex-Token=..."
}
```

**Respuesta cuando no está disponible:**
```json
{
  "available": false,
  "plexUrl": null
}
```

### Detalles Técnicos

- **Limpieza de rutas para series**: Las series en Plex devuelven rutas con `/children`, pero para acceder a los detalles se necesita la ruta base sin este sufijo. El endpoint lo maneja automáticamente.
- **Codificación de URLs**: Las claves de metadata se codifican correctamente con `encodeURIComponent` para asegurar que funcionen en todos los navegadores.
- **Machine Identifier**: Se obtiene dinámicamente del servidor Plex para construir URLs correctas.
- **Caché de versión**: Usa `plex-v2:` como prefijo de caché para evitar conflictos con versiones anteriores.

## Privacidad y Seguridad

- ✅ El token de Plex **nunca** se expone al cliente
- ✅ Todas las comunicaciones son servidor-a-servidor
- ✅ El token se almacena únicamente en `.env.local` (no versionado en git)
- ✅ La búsqueda solo accede a tu biblioteca local
- ✅ No se envía información a servicios externos

## Próximas Mejoras

Posibles mejoras futuras:
- [x] ✅ Soporte completo para películas y series
- [x] ✅ URLs correctamente formateadas con codificación apropiada
- [x] ✅ Limpieza automática de rutas `/children` para series
- [ ] Soporte para múltiples servidores Plex
- [ ] Integración con Plex Pass para características premium
- [ ] Sincronización del estado "visto" con Plex
- [ ] Búsqueda de subtítulos disponibles
- [ ] Información de calidad del archivo (4K, HDR, etc.)
- [ ] Mostrar información adicional: resolución, codec, tamaño del archivo
- [ ] Soporte para episodios específicos de series

## Soporte

Si encuentras problemas:
1. Verifica que Plex Media Server esté ejecutándose
2. Confirma que las variables de entorno estén configuradas correctamente
3. Revisa la consola del navegador y los logs del servidor
4. Verifica que tengas acceso a tu biblioteca de Plex

---

**Desarrollado para The Show Verse** 🎬
