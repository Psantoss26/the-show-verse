package com.theshowverse.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GoogleCancelacionTest {

    @Test
    fun cerrarElSelectorEsCancelacionDelUsuario() {
        assertTrue(GoogleCancelacion.esDelUsuario("activity is cancelled by the user."))
        assertTrue(GoogleCancelacion.esDelUsuario(null))
        assertTrue(GoogleCancelacion.esDelUsuario(""))
    }

    @Test
    fun elegirCuentaSinClienteAndroidNoEsCancelacion() {
        assertFalse(GoogleCancelacion.esDelUsuario("[16] Account reauth failed."))
        assertFalse(GoogleCancelacion.esDelUsuario("[28444] Developer console is not set up correctly."))
    }
}
