# Feature Specification: Common Soundtrack Match Criteria

**Feature Branch**: `[001-soundtrack-match-criteria]`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "Definir el criterio comun de soundtracks en Spotify, iTunes y Deezer"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Show only relevant soundtracks (Priority: P1)

As a user viewing a movie or series details page, I want the soundtrack section to show only a soundtrack that clearly belongs to that title, so I do not open unrelated music with a similar name.

**Why this priority**: The current value of the soundtrack section depends on trust. A single unrelated album or playlist makes the section feel unreliable, especially for short or common titles.

**Independent Test**: Can be fully tested by checking known ambiguous titles and confirming that unrelated results are rejected even when they contain one or more title words.

**Acceptance Scenarios**:

1. **Given** a movie or series with a short title such as "Dark", **When** available soundtrack candidates include results with additional unrelated title words such as "Dark Knight" or "Dark Souls", **Then** those candidates are rejected.
2. **Given** a movie with a common title such as "Avatar", **When** soundtrack candidates include both an unrelated exact-title album and a clearly movie-related soundtrack result, **Then** the movie-related soundtrack result is selected.
3. **Given** a movie with alternate regional titles such as "Harry Potter and the Philosopher's Stone", **When** soundtrack candidates use a known alternate title for the same work, **Then** the matching soundtrack remains eligible.

---

### User Story 2 - Use a shared rule across providers (Priority: P2)

As a user, I want soundtrack results from every supported music source to follow the same relevance standard, so the displayed result is consistent regardless of which source has available data.

**Why this priority**: Applying strict rules to one source but loose rules to another can reintroduce the same false positives under a different source label.

**Independent Test**: Can be tested by running the same title set across all supported sources and verifying that each source accepts or rejects candidates according to the same user-visible criteria.

**Acceptance Scenarios**:

1. **Given** multiple music sources return candidates for the same title, **When** one source returns an official or clearly title-related soundtrack and another source returns an unrelated title collision, **Then** only the relevant soundtrack is eligible for display.
2. **Given** no source provides a candidate that satisfies the shared criteria, **When** the user opens the details page, **Then** the soundtrack section is not shown for that title.

---

### User Story 3 - Prefer official albums, then meaningful playlists (Priority: P3)

As a user, I want official soundtrack albums to be preferred when they clearly match the title, and playlists to be used only when no reliable album match exists, so the section remains useful without forcing bad album matches.

**Why this priority**: Many titles have official albums, but others only have user-curated or unofficial soundtrack lists. The fallback is valuable only when it remains selective.

**Independent Test**: Can be tested by checking title examples where the best valid result is an album, where the best valid result is a playlist, and where no result should be shown.

**Acceptance Scenarios**:

1. **Given** a valid official soundtrack album exists for a title, **When** soundtrack candidates are evaluated, **Then** that album is preferred over playlists.
2. **Given** no album satisfies the shared relevance criteria, **When** a playlist explicitly references the exact title and soundtrack intent, **Then** the playlist is eligible.
3. **Given** a playlist only contains part of the title inside a different phrase, **When** it lacks soundtrack intent or title equivalence, **Then** it is rejected.

### Edge Cases

- Titles made of one common word require stricter rejection of candidates with additional unrelated identity words.
- Candidates that contain a title word but describe a different movie, series, game, artist release, volume, sequel, or unrelated work are rejected.
- Candidates with generic soundtrack wording are not sufficient when the candidate identity points to another title.
- Candidates with exact or alternate title wording but no soundtrack intent are not automatically accepted unless other evidence makes them clearly connected to the movie or series.
- If all candidates are ambiguous, the app shows no soundtrack for that title instead of showing the least bad result.
- Punctuation, casing, accents, apostrophes, ampersands, and regional title variants should not prevent a genuine match.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST evaluate soundtrack candidates from Spotify, iTunes, and Deezer using a single shared relevance standard.
- **FR-002**: The system MUST require a candidate to match the requested movie or series identity before it can be displayed.
- **FR-003**: The system MUST treat exact title, original title, and known alternate or localized title as valid title identities for matching.
- **FR-004**: The system MUST reject candidates whose title contains only a partial title match plus additional unrelated identity words.
- **FR-005**: The system MUST reject candidates that appear to belong to a different media work, artist album, game soundtrack, sequel, volume, or unrelated release even when they include one or more words from the requested title.
- **FR-006**: The system MUST prefer eligible official or clearly soundtrack-specific albums over eligible playlists.
- **FR-007**: The system MUST use eligible playlists as fallback only when no album satisfies the shared relevance standard.
- **FR-008**: The system MUST require fallback playlists to show both title identity and soundtrack intent through their visible metadata.
- **FR-009**: The system MUST show no soundtrack when no candidate satisfies the shared relevance standard.
- **FR-010**: The system MUST preserve current successful soundtrack matches where the selected result already clearly belongs to the requested title.
- **FR-011**: The system MUST support validation cases for ambiguous titles including "Dark", "Avatar", "One Day", "Love & Other Drugs", "The Illusionist", and "Harry Potter and the Philosopher's Stone".
- **FR-012**: The system MUST make the selected soundtrack outcome explainable enough for maintainers to understand why a candidate was accepted, rejected, or skipped.

### Key Entities

- **Requested Title**: The movie or series for which a soundtrack is being displayed. Key attributes include display title, original title, release year, content type, and known alternate titles.
- **Soundtrack Candidate**: A potential album or playlist from a supported music source. Key attributes include visible title, creator or artist label, release context, result type, source, and any visible soundtrack-related wording.
- **Match Decision**: The result of evaluating one candidate against one requested title. Key attributes include accepted or rejected status, confidence category, rejection reason when applicable, and provider/source.
- **Soundtrack Selection**: The final result shown on the details page, or the explicit decision to show no soundtrack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a curated validation set of at least 30 ambiguous movies and series, 95% or more of displayed soundtracks clearly belong to the requested title.
- **SC-002**: For the known regression titles "Dark", "Avatar", "One Day", "Love & Other Drugs", "The Illusionist", and "Harry Potter and the Philosopher's Stone", the system selects the expected relevant result or shows no soundtrack when no valid result exists.
- **SC-003**: For titles that currently return correct official soundtracks, at least 95% continue to display an equivalent valid soundtrack after the shared criteria are applied.
- **SC-004**: When no supported source has a valid match, the details page hides the soundtrack section rather than displaying an unrelated or ambiguous result.
- **SC-005**: Users can inspect a details page without encountering visibly unrelated soundtrack titles in normal browsing of the validation set.

## Assumptions

- The feature applies to movies and series details pages where soundtrack information can be shown.
- Spotify, iTunes, and Deezer remain the supported music sources for this feature.
- Existing correct matches should be protected; the goal is to reduce false positives without broadly changing successful behavior.
- A missing soundtrack is preferable to displaying a soundtrack that likely belongs to another work.
- The app can use the movie or series title, original title, release year, content type, and known alternate titles already available in the product experience.
