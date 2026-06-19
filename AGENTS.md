# The Show Verse Agent Guidance

This project uses Chrome for Developers Modern Web Guidance.

Before implementing UI, CSS, HTML, accessibility, client-side interaction, animation, image loading, or frontend performance work, consult the installed Modern Web Guidance CLI:

```sh
npm run mw:search -- "<task description>"
```

Then retrieve the relevant guide:

```sh
npm run mw:retrieve -- "<guide-id>"
```

Project Baseline target: Baseline 2024.

Use modern platform features when they meet this target. For newer or limited-availability features, prefer progressive enhancement and feature detection, and avoid adding polyfills or dependencies unless the benefit is clear for this app.

For Next.js web development assistance, use the local agent profile at:

```sh
.docs/agents/nextjs-web-agent.md
```

For backend Node.js, Fastify, PostgreSQL/Neon, Redis, Drizzle, Railway deployment,
and frontend-backend integration work, use the local agent profile at:

```sh
.docs/agents/backend-node-fastify-agent.md
```

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
