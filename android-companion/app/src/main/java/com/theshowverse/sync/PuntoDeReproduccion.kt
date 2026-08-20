package com.theshowverse.sync

/**
 * Último punto de reproducción conocido de cada paquete.
 *
 * POR QUÉ ES UNA SOLA COSA Y NO TRES MAPAS SUELTOS. La posición, su duración y si
 * esa posición está DEDUCIDA por reloj describen un mismo instante de un mismo
 * contenido: separarlas permitía actualizar unas antes que otras y mezclar datos
 * de dos títulos distintos. Pasó de verdad al encadenar episodios: el servicio
 * apuntaba la marca de estimación del episodio que empezaba y, acto seguido,
 * volcaba el que acababa de terminar leyendo esa marca nueva. Si el nuevo no
 * publicaba posición, el anterior se volcaba como estimado — y el servidor nunca
 * marca como visto una posición estimada, así que el episodio terminado se
 * quedaba sin registrar. Ver una serie del tirón es el caso más común, y era
 * justo el que fallaba.
 *
 * Con un único registro por paquete, o se escribe entero o no se escribe: no hay
 * ventana en la que la posición sea de un título y su marca de otro.
 */
class PuntoDeReproduccion {

    data class Punto(
        val posSec: Long,
        val durSec: Long,
        /** La posición no la publica el reproductor: está deducida por reloj. */
        val estimado: Boolean,
    )

    private val puntos = HashMap<String, Punto>()

    /**
     * Apunta el punto actual de [pkg]. Una posición negativa se ignora: el
     * registro anterior es preferible a uno inservible.
     */
    fun registrar(pkg: String, posSec: Long, durSec: Long, estimado: Boolean) {
        if (posSec < 0) return
        puntos[pkg] = Punto(posSec, durSec, estimado)
    }

    fun de(pkg: String): Punto? = puntos[pkg]

    fun olvidar(pkg: String) {
        puntos.remove(pkg)
    }
}
