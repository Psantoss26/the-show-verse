package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DetailsUrlTest {

    private val origin = "https://theshowverse.com"

    @Test
    fun buildsMovieUrl() {
        assertEquals(
            "https://theshowverse.com/details/movie/157336",
            DetailsUrl.build(origin, SyncedInfo(tmdbId = 157336, mediaType = "movie")),
        )
    }

    @Test
    fun buildsEpisodeUrlForSeries() {
        assertEquals(
            "https://theshowverse.com/details/tv/66732/season/4/episode/5",
            DetailsUrl.build(origin, SyncedInfo(tmdbId = 66732, mediaType = "tv", season = 4, episode = 5)),
        )
    }

    @Test
    fun buildsSeriesUrlWhenNoEpisode() {
        assertEquals(
            "https://theshowverse.com/details/tv/66732",
            DetailsUrl.build(origin, SyncedInfo(tmdbId = 66732, mediaType = "tv")),
        )
    }

    @Test
    fun nullWhenUnresolvedOrNoOrigin() {
        assertNull(DetailsUrl.build(origin, SyncedInfo(tmdbId = 0, mediaType = "tv")))
        assertNull(DetailsUrl.build("", SyncedInfo(tmdbId = 1, mediaType = "movie")))
        assertNull(DetailsUrl.build(origin, null))
    }

    @Test
    fun trimsTrailingSlashFromOrigin() {
        assertEquals(
            "https://theshowverse.com/details/movie/1",
            DetailsUrl.build("https://theshowverse.com/", SyncedInfo(tmdbId = 1, mediaType = "movie")),
        )
    }
}
