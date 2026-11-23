package com.theshowverse.sync

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class GestoModalTest {

    private val antes = Locale.getDefault()

    @After
    fun restaurarLocale() = Locale.setDefault(antes)

    @Test
    fun llamaALaWebConFaseProgresoYBorde() {
        assertEquals(
            "window.__svModalBackGesture&&window.__svModalBackGesture('progress',0.5,true)",
            GestoModal.js(GestoModal.Fase.PROGRESO, 0.5f, desdeIzquierda = true),
        )
    }

    @Test
    fun elProgresoUsaPuntoAunqueElIdiomaUseComa() {
        Locale.setDefault(Locale.forLanguageTag("es-ES"))
        assertEquals(
            "window.__svModalBackGesture&&window.__svModalBackGesture('start',0.125,false)",
            GestoModal.js(GestoModal.Fase.INICIO, 0.125f, desdeIzquierda = false),
        )
    }

    @Test
    fun elProgresoSeLimitaAlRango() {
        assertEquals(
            "window.__svModalBackGesture&&window.__svModalBackGesture('cancel',1.0,true)",
            GestoModal.js(GestoModal.Fase.CANCELAR, 7f, desdeIzquierda = true),
        )
    }
}
