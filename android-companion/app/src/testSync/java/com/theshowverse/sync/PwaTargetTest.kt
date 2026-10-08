package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PwaTargetTest {
    private val root = PwaTarget("org.chromium.webapk.install1", "PwaLauncher", "https://theshowverse.com/")

    @Test fun selectsInstalledPwaForMoviesShowsAndEpisodes() {
        for (path in listOf("movie/42", "tv/7", "tv/7/season/2/episode/3?source=notification#details")) {
            assertEquals(root, PwaTarget.forUrl("https://theshowverse.com/details/$path", listOf(root)))
        }
    }

    @Test fun neverSelectsAnotherOriginOrPort() {
        for (url in listOf("https://theshowverse.com.evil.example/details/movie/42", "https://other.example/details/movie/42", "https://theshowverse.com:444/details/movie/42", "http://theshowverse.com/details/movie/42")) {
            assertNull(PwaTarget.forUrl(url, listOf(root)))
        }
    }

    @Test fun handlesExplicitHttpsPortAndHostCase() {
        assertEquals(root, PwaTarget.forUrl("https://THESHOWVERSE.COM:443/details/movie/42", listOf(root)))
    }

    @Test fun selectsMostSpecificScopeRegardlessOfCandidateOrder() {
        val scoped = root.copy(packageName = "org.chromium.webapk.install2", scope = "https://theshowverse.com/details/")
        for (candidates in listOf(listOf(root, scoped), listOf(scoped, root))) {
            assertEquals(scoped, PwaTarget.forUrl("https://theshowverse.com/details/tv/7", candidates))
            assertEquals(root, PwaTarget.forUrl("https://theshowverse.com/calendar", candidates))
        }
        assertNull(PwaTarget.forUrl("https://theshowverse.com/details-other/movie/42", listOf(scoped)))
    }

    @Test fun supportsReinstalledPwaWithoutHardcodedPackage() {
        val reinstalled = root.copy(packageName = "org.chromium.webapk.newInstallation")
        assertEquals(reinstalled, PwaTarget.forUrl("https://theshowverse.com/details/movie/42", listOf(reinstalled)))
    }

    @Test fun missingPwaOrWrongScopeDoesNotProduceBrowserTarget() {
        assertNull(PwaTarget.forUrl("https://theshowverse.com/details/movie/42", emptyList()))
        assertNull(PwaTarget.forUrl("https://theshowverse.com/details/movie/42", listOf(root.copy(scope = "https://theshowverse.com/calendar/"))))
    }

    @Test fun rejectsMalformedUrlsCredentialsAndUnnormalizedPaths() {
        for (url in listOf("not a url", "javascript:alert(1)", "https://user@theshowverse.com/details/movie/42", "https://theshowverse.com/details/../calendar")) {
            assertNull(PwaTarget.forUrl(url, listOf(root)))
        }
        assertNull(PwaTarget.forUrl("https://theshowverse.com/details/movie/42", listOf(root.copy(scope = "not a url"))))
    }
}
