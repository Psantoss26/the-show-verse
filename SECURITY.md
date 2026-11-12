# Security Policy

## Supported versions

The Show Verse is deployed continuously from `main` to [theshowverse.com](https://theshowverse.com). Only the latest code on `main` (and `develop`, which feeds it) receives security fixes.

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Report them privately through GitHub: go to the [Security tab](../../security) and choose **Report a vulnerability** ([direct link](../../security/advisories/new)).

Include, where you can:

- what is affected (web app, `/api` routes, backend API, browser extension or Android app);
- steps to reproduce, or a proof of concept;
- the impact you expect (data exposure, account takeover, etc.).

You can expect an acknowledgement within 7 days and updates as the fix progresses. Once it is fixed and deployed, the advisory is published with credit to you, unless you prefer to stay anonymous.

## Scope

In scope: this repository's code and the deployment at theshowverse.com.

Out of scope: third-party services the app uses (TMDb, Trakt, OMDb, Plex, Spotify, JustWatch, Google). Please report problems with those to their own maintainers.

Please test only against your own account, and never access, modify or delete other users' data.
