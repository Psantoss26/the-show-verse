# Contributing to The Show Verse

Thanks for your interest in The Show Verse! Bug reports, ideas, documentation fixes and code are all welcome.

> 🇪🇸 Se puede escribir en castellano o en inglés: issues, PRs y comentarios en cualquiera de los dos idiomas. La documentación de `docs/` y el `CHANGELOG.md` están en castellano.

## Ways to help

- **Report a bug**: open a [bug report](../../issues/new?template=bug_report.yml) with steps to reproduce, the device and browser, and a screenshot if it is visual.
- **Suggest a feature**: open a [feature request](../../issues/new?template=feature_request.yml) describing the problem it solves.
- **Pick an issue**: issues labelled [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small and self-contained; [`help wanted`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) ones are bigger. Leave a comment before starting so work isn't duplicated.
- **Improve the docs**: [`docs/`](docs/README.md) is an Obsidian vault; any fix or clarification helps.

Security problems are **not** reported in public issues: see [SECURITY.md](SECURITY.md).

## Development setup

You need **Node.js 22+**, **Docker Engine** with **Docker Compose v2**, and a free [TMDb API key](https://www.themoviedb.org/settings/api). Google, Trakt, OMDb and Spotify keys are optional.

```bash
git clone https://github.com/Psantoss26/the-show-verse.git
cd the-show-verse
npm ci
npm --prefix backend ci
cp .env.example .env
cp backend/.env.example backend/.env
npm run local:setup
```

Fill in the keys in `.env` and `backend/.env`, then run the web app and the API in two terminals:

```bash
npm run dev
```

```bash
npm --prefix backend run dev
```

The web app runs on http://localhost:3000 and the API on http://localhost:3001. The backend starts PostgreSQL and Redis in Docker and applies the migrations. Full guide (in Spanish): [ARRANQUE-LOCAL.md](docs/infrastructure/ARRANQUE-LOCAL.md).

## Project layout

| Folder | What lives there |
|---|---|
| [`src/`](src) | Next.js 16 app (App Router) and its `/api` routes, which proxy the backend |
| [`backend/`](backend) | Fastify 5 API, Drizzle ORM schema and migrations |
| [`netflix-extension/`](netflix-extension) | Browser extension that detects what you watch on streaming sites |
| [`android-companion/`](android-companion) | Android companion app (playback detection and push) |
| [`deploy/`](deploy) | Docker setups for local, NAS and Postgres |
| [`docs/`](docs/README.md) | Documentation (Obsidian vault) |

## Making a change

1. Fork the repository and create a branch from `develop`: `git checkout -b feature/my-change`.
2. Keep the change focused: one fix or feature per pull request.
3. Follow the style of the code you touch, and run the checks before pushing:

   ```bash
   npm run lint
   npm test                               # all frontend tests (runs `node --test`, skips the `*.browser.test.mjs` files)
   node --test path/to/changed.test.mjs   # or just one file; frontend tests live next to the code they test
   npm --prefix backend test              # needs the local Postgres from `npm run db:up`
   ```

4. **Documentation is part of the change.** If you add, remove or change something users can see, a route in `src/app`, a backend endpoint or an environment variable, update in the same PR:
   - a line in [`CHANGELOG.md`](CHANGELOG.md) under *Sin publicar*, written from the user's point of view (Spanish preferred; English is fine and will be translated);
   - the affected document in `docs/` (API reference, pages, `docs/features/`…), and `.env.example` for new variables.

   The full rules are in the *Documentación* section of [`AGENTS.md`](AGENTS.md). Purely internal changes (refactors, tests) don't need a changelog line.
5. Open a pull request against `develop` and fill in the template. Add before/after screenshots or a short video for visual changes, on both desktop and mobile when it applies.

## Commit messages

Commits in this repository are short, in Spanish, and start with the area they touch, for example `Ficha: …`, `Perfil: …` or `Backend: …`. English commit messages are also accepted.

## AI-assisted contributions

Using AI tools is fine. You are responsible for the code you submit: read it, test it, and make sure you can explain it in review.

## License

By contributing, you agree that your contributions are licensed under the [GNU Affero General Public License v3.0 or later](LICENSE), the same license as the project.

## Code of conduct

Everyone taking part in this project is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
