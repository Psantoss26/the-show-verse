# Configuración Rápida de Plex - Guía en 3 Pasos

## Paso 1: Obtener Token de Plex

1. Ve a https://app.plex.tv
2. Inicia sesión en tu cuenta
3. Abre cualquier película o serie
4. Clic derecho en el reproductor → **"Ver XML"** o **"Get Info"**
5. En la URL que aparece, busca `X-Plex-Token=`
6. Copia todo el valor después del `=` (ejemplo: `***REMOVED***`)

**Nota:** El token es único para tu servidor y funciona para todas las bibliotecas (películas y series).

## Paso 2: Configurar Variables de Entorno

Crea o edita el archivo `.env` en la raíz del proyecto:

```env
# URL de tu servidor Plex (usa la URL exacta de tu servidor)
# Si usas Plex Direct, usa la URL completa con HTTPS y puerto
PLEX_URL=https://90-170-96-44.f3580c34e4b24e42bddab70a8fe891a5.plex.direct:14466

# Token de autenticación (reemplaza con tu token)
PLEX_TOKEN=***REMOVED***
```

**URLs comunes:**
- Servidor local: `http://localhost:32400`
- IP local: `http://192.168.1.100:32400`
- Plex Direct: `https://xxx-xxx-xx-xx.xxxxx.plex.direct:xxxxx` (usa tu URL completa)

## Paso 3: Reiniciar el Servidor

```bash
# Detén el servidor (Ctrl + C)
# Reinicia:
npm run dev
```

## ¡Listo! 🎬

Ahora cuando veas los detalles de películas o series:
- ✅ El logo de Plex aparecerá **al final** de las plataformas disponibles
- ✅ Tendrá un **punto verde 🟢** en la esquina superior derecha
- ✅ Al hacer clic, se abrirá directamente en Plex Web
- ✅ Funciona tanto para **películas** como para **series**

---

📖 Documentación completa en [PLEX_INTEGRATION.md](./PLEX_INTEGRATION.md)
