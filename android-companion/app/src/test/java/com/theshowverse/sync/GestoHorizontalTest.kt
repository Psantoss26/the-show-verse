package com.theshowverse.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * De esta regla depende que deslizar entre secciones del perfil funcione dentro
 * de la app: si el contenedor de "deslizar para recargar" se queda el gesto, la
 * página recibe un touchcancel y lo descarta.
 */
class GestoHorizontalTest {

    private val umbral = 24 // el típico scaledTouchSlop de un móvil

    @Test
    fun `un deslizamiento lateral es de la pagina`() {
        assertTrue(GestoHorizontal.esHorizontal(120f, 10f, umbral))
        assertTrue(GestoHorizontal.esHorizontal(-120f, 10f, umbral))
        // Con algo de deriva vertical, que es lo normal con el pulgar.
        assertTrue(GestoHorizontal.esHorizontal(90f, 40f, umbral))
    }

    @Test
    fun `un arrastre vertical sigue recargando`() {
        assertFalse(GestoHorizontal.esHorizontal(10f, 120f, umbral))
        assertFalse(GestoHorizontal.esHorizontal(-30f, 120f, umbral))
        // Diagonal con más recorrido vertical: recarga.
        assertFalse(GestoHorizontal.esHorizontal(60f, 80f, umbral))
    }

    @Test
    fun `por debajo del umbral no se decide nada todavia`() {
        // Un temblor de dedo no puede desactivar la recarga.
        assertFalse(GestoHorizontal.esHorizontal(12f, 2f, umbral))
        assertFalse(GestoHorizontal.esHorizontal(0f, 0f, umbral))
    }
}
