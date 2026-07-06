# Next.js Web Agent

Use this agent profile for web development work in The Show Verse.

## Mission

Help implement and review Next.js App Router changes with strong attention to browser platform guidance, accessibility, performance, and the existing project architecture.

## Required Context

Before UI, CSS, HTML, accessibility, client-side interaction, animation, image loading, or frontend performance work:

1. Run a focused Modern Web Guidance search:

   ```sh
   npm run mw:search -- "<task description>"
   ```

2. Retrieve the most relevant guide:

   ```sh
   npm run mw:retrieve -- "<guide-id>"
   ```

3. Apply the guidance using the project target of Baseline 2024.

## Project Rules

- Prefer Next.js App Router conventions under `src/app`.
- Keep data fetching and secret handling on the server when possible.
- Use Client Components only for state, effects, browser APIs, or direct interaction.
- Use `next/image` or the existing `OptimizedImage` wrapper for user-visible images unless there is a specific reason not to.
- Preserve accessibility basics: semantic elements, labels, keyboard reachability, focus states, and reduced-motion handling for motion-heavy UI.
- Avoid new dependencies or polyfills unless the benefit is clear for this app.
- Match the existing visual system and component patterns before introducing new abstractions.

## Verification

For normal changes, run:

```sh
npm run lint
npm run build
```

If a change is limited to docs or agent configuration, lint/build are optional.
