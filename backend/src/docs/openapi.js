export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'The Show Verse API',
    version: '1.0.0',
    description:
      'Official REST API for The Show Verse backend. This API owns private user data such as auth, favorites, watchlist, history, ratings, custom lists, stats, imports, and cached TMDb metadata.',
    contact: {
      name: 'The Show Verse',
    },
  },
  servers: [
    {
      url: 'https://the-show-verse-production.up.railway.app',
      description: 'Production Railway backend',
    },
    {
      url: 'http://localhost:3001',
      description: 'Local development backend',
    },
  ],
  tags: [
    { name: 'System', description: 'Service health, readiness, and documentation.' },
    { name: 'Auth', description: 'User authentication, refresh tokens, and TMDb session bootstrap.' },
    { name: 'Favorites', description: 'Private user favorites stored in PostgreSQL.' },
    { name: 'Watchlist', description: 'Private user watchlist stored in PostgreSQL.' },
    { name: 'History', description: 'Watch history for movies, shows, seasons, and episodes.' },
    { name: 'Ratings', description: 'Private user ratings.' },
    { name: 'Lists', description: 'Private and public custom user lists.' },
    { name: 'Items', description: 'Unified item status endpoints for frontend compatibility.' },
    { name: 'TMDb', description: 'Cached TMDb metadata proxy.' },
    { name: 'Import', description: 'One-time import flows from external providers.' },
    { name: 'Stats', description: 'User stats computed from private backend data.' },
  ],
  externalDocs: {
    description: 'Manual backend testing guide',
    url: '/docs',
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Use the accessToken returned by /v1/auth/login, /v1/auth/register, /v1/auth/tmdb, or /v1/auth/refresh.',
      },
    },
    parameters: {
      TmdbId: {
        name: 'tmdbId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
        description: 'TMDb numeric id.',
      },
      MediaType: {
        name: 'mediaType',
        in: 'path',
        required: true,
        schema: { type: 'string', enum: ['movie', 'tv'] },
      },
      RatingMediaType: {
        name: 'mediaType',
        in: 'path',
        required: true,
        schema: { type: 'string', enum: ['movie', 'tv', 'episode'] },
      },
      ListId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          issues: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        additionalProperties: true,
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          username: { type: 'string' },
          displayName: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          plan: { type: 'string', example: 'free' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      Favorite: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          tmdbId: { type: 'integer' },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
          title: { type: 'string', nullable: true },
          posterPath: { type: 'string', nullable: true },
          addedAt: { type: 'string', format: 'date-time' },
        },
      },
      WatchlistItem: {
        allOf: [
          { $ref: '#/components/schemas/Favorite' },
          {
            type: 'object',
            properties: {
              priority: { type: 'integer', default: 0 },
            },
          },
        ],
      },
      HistoryItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          tmdbId: { type: 'integer' },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
          season: { type: 'integer', nullable: true },
          episode: { type: 'integer', nullable: true },
          watchedAt: { type: 'string', format: 'date-time' },
          runtimeMins: { type: 'integer', nullable: true },
          title: { type: 'string', nullable: true },
          posterPath: { type: 'string', nullable: true },
        },
      },
      Rating: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          tmdbId: { type: 'integer' },
          mediaType: { type: 'string', enum: ['movie', 'tv', 'episode'] },
          season: { type: 'integer', nullable: true },
          episode: { type: 'integer', nullable: true },
          rating: { type: 'integer', minimum: 1, maximum: 10 },
          title: { type: 'string', nullable: true },
          ratedAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UserList: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          isPublic: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UserListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          listId: { type: 'string', format: 'uuid' },
          tmdbId: { type: 'integer' },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
          title: { type: 'string', nullable: true },
          posterPath: { type: 'string', nullable: true },
          position: { type: 'integer' },
          addedAt: { type: 'string', format: 'date-time' },
        },
      },
      ItemInput: {
        type: 'object',
        required: ['tmdbId', 'mediaType'],
        properties: {
          tmdbId: { type: 'integer', minimum: 1 },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
          title: { type: 'string' },
          posterPath: { type: 'string' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'object', additionalProperties: true } },
          page: { type: 'integer' },
        },
      },
      ItemStatus: {
        type: 'object',
        properties: {
          connected: { type: 'boolean' },
          tmdbId: { type: 'integer' },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
          favorite: { type: 'boolean' },
          favoriteAddedAt: { type: 'string', format: 'date-time', nullable: true },
          watchlist: { type: 'boolean' },
          watchlistAddedAt: { type: 'string', format: 'date-time', nullable: true },
          watched: { type: 'boolean' },
          plays: { type: 'integer' },
          lastWatchedAt: { type: 'string', format: 'date-time', nullable: true },
          rating: { type: 'integer', nullable: true },
          ratedAt: { type: 'string', format: 'date-time', nullable: true },
          watchedBySeason: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'integer' },
            },
          },
        },
      },
      TmdbResponse: {
        type: 'object',
        additionalProperties: true,
        description: 'Raw TMDb-compatible response proxied and cached by the backend.',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required or token invalid.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Invalid request body, params, or query.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'API root',
        responses: {
          200: {
            description: 'Service metadata.',
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness check',
        responses: {
          200: { description: 'The process is alive.' },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['System'],
        summary: 'Readiness check',
        description: 'Checks PostgreSQL and Redis availability. Railway uses this endpoint as healthcheck.',
        responses: {
          200: { description: 'Service is ready.' },
          503: { description: 'At least one required dependency is unavailable.' },
        },
      },
    },
    '/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a user with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'username', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_-]+$' },
                  password: { type: 'string', minLength: 8, maxLength: 128 },
                  displayName: { type: 'string', maxLength: 50 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          400: { $ref: '#/components/responses/ValidationError' },
          409: { description: 'Email or username already exists.' },
        },
      },
    },
    '/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Authenticated.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/auth/tmdb': {
      post: {
        tags: ['Auth'],
        summary: 'Create or recover backend session from a valid TMDb session',
        description: 'Used by the Vercel TMDb OAuth callback to bootstrap a backend JWT session and persist user data in Neon.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId'],
                properties: { sessionId: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Backend session created.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          401: { description: 'TMDb session is invalid.' },
        },
      },
    },
    '/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token and issue a new access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Tokens refreshed.' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout current refresh token',
        responses: {
          200: { description: 'Logged out.' },
        },
      },
    },
    '/v1/auth/logout/all': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke all refresh tokens for the authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All sessions revoked.' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Current user.', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      patch: {
        tags: ['Auth'],
        summary: 'Update authenticated user profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  displayName: { type: 'string', maxLength: 50 },
                  avatarUrl: { type: 'string' },
                  bio: { type: 'string' },
                  locale: { type: 'string' },
                  timezone: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated.' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/favorites': {
      get: {
        tags: ['Favorites'],
        summary: 'List authenticated user favorites',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['movie', 'tv'] } },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: {
          200: { description: 'Favorites list.', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/PaginatedResponse' }] } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Favorites'],
        summary: 'Add or refresh a favorite',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemInput' } } } },
        responses: {
          201: { description: 'Favorite stored.', content: { 'application/json': { schema: { type: 'object', properties: { item: { $ref: '#/components/schemas/Favorite' } } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/favorites/{tmdbId}/{mediaType}': {
      delete: {
        tags: ['Favorites'],
        summary: 'Remove a favorite',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        responses: { 200: { description: 'Favorite removed.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/v1/favorites/check/{tmdbId}/{mediaType}': {
      get: {
        tags: ['Favorites'],
        summary: 'Check whether an item is in favorites',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        responses: { 200: { description: 'Favorite status.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/v1/watchlist': {
      get: {
        tags: ['Watchlist'],
        summary: 'List authenticated user watchlist',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['movie', 'tv'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['added_at', 'priority'], default: 'added_at' } },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: { 200: { description: 'Watchlist.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
      post: {
        tags: ['Watchlist'],
        summary: 'Add or refresh an item in watchlist',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/ItemInput' },
                  { type: 'object', properties: { priority: { type: 'integer', minimum: 0, maximum: 9999 } } },
                ],
              },
            },
          },
        },
        responses: { 201: { description: 'Watchlist item stored.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/v1/watchlist/{tmdbId}/{mediaType}': {
      delete: {
        tags: ['Watchlist'],
        summary: 'Remove from watchlist',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        responses: { 200: { description: 'Watchlist item removed.' } },
      },
      patch: {
        tags: ['Watchlist'],
        summary: 'Update watchlist priority',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['priority'], properties: { priority: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Watchlist item updated.' } },
      },
    },
    '/v1/watchlist/check/{tmdbId}/{mediaType}': {
      get: {
        tags: ['Watchlist'],
        summary: 'Check whether an item is in watchlist',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        responses: { 200: { description: 'Watchlist status.' } },
      },
    },
    '/v1/history': {
      get: {
        tags: ['History'],
        summary: 'List watch history',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['movie', 'tv'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: { 200: { description: 'History page.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
      post: {
        tags: ['History'],
        summary: 'Add a watch history entry',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tmdbId', 'mediaType'],
                properties: {
                  tmdbId: { type: 'integer', minimum: 1 },
                  mediaType: { type: 'string', enum: ['movie', 'tv'] },
                  season: { type: 'integer', minimum: 1 },
                  episode: { type: 'integer', minimum: 1 },
                  watchedAt: { type: 'string', format: 'date-time' },
                  runtimeMins: { type: 'integer', minimum: 1 },
                  title: { type: 'string' },
                  posterPath: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'History item added.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/v1/history/{id}': {
      delete: {
        tags: ['History'],
        summary: 'Delete a specific history item by uuid',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'History item deleted.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/v1/history/bulk': {
      delete: {
        tags: ['History'],
        summary: 'Delete multiple history items',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string', format: 'uuid' } } } } } } },
        responses: { 200: { description: 'Bulk delete result.' } },
      },
    },
    '/v1/history/shows/{tmdbId}': {
      get: {
        tags: ['History'],
        summary: 'Get watched episodes grouped by season for a show',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }],
        responses: { 200: { description: 'Watched by season map.' } },
      },
    },
    '/v1/history/movies/{tmdbId}': {
      get: {
        tags: ['History'],
        summary: 'Get plays for a movie',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }],
        responses: { 200: { description: 'Movie plays.' } },
      },
    },
    '/v1/history/episodes/{tmdbId}/{season}/{episode}': {
      get: {
        tags: ['History'],
        summary: 'Get plays for one episode',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/TmdbId' },
          { name: 'season', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          { name: 'episode', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: { 200: { description: 'Episode plays.' } },
      },
    },
    '/v1/history/episodes': {
      post: {
        tags: ['History'],
        summary: 'Set one episode watched or unwatched',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tmdbId', 'season', 'episode', 'watched'],
                properties: {
                  tmdbId: { type: 'integer', minimum: 1 },
                  season: { type: 'integer', minimum: 1 },
                  episode: { type: 'integer', minimum: 1 },
                  watched: { type: 'boolean' },
                  watchedAt: { type: 'string' },
                  title: { type: 'string' },
                  posterPath: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated watchedBySeason.' } },
      },
    },
    '/v1/history/seasons': {
      post: {
        tags: ['History'],
        summary: 'Set an entire season watched or unwatched',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tmdbId', 'season', 'watched'],
                properties: {
                  tmdbId: { type: 'integer', minimum: 1 },
                  season: { type: 'integer', minimum: 0 },
                  watched: { type: 'boolean' },
                  watchedAt: { type: 'string' },
                  episodes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['episode'],
                      properties: {
                        episode: { type: 'integer', minimum: 1 },
                        title: { type: 'string' },
                      },
                    },
                  },
                  title: { type: 'string' },
                  posterPath: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated watchedBySeason.' } },
      },
    },
    '/v1/ratings': {
      get: {
        tags: ['Ratings'],
        summary: 'List user ratings',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['movie', 'tv', 'episode'] } },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: { 200: { description: 'Ratings page.' } },
      },
      post: {
        tags: ['Ratings'],
        summary: 'Create or update a rating',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tmdbId', 'mediaType', 'rating'],
                properties: {
                  tmdbId: { type: 'integer', minimum: 1 },
                  mediaType: { type: 'string', enum: ['movie', 'tv', 'episode'] },
                  rating: { type: 'integer', minimum: 1, maximum: 10 },
                  season: { type: 'integer', minimum: 1 },
                  episode: { type: 'integer', minimum: 1 },
                  title: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Rating stored.' }, 400: { $ref: '#/components/responses/ValidationError' } },
      },
    },
    '/v1/ratings/{tmdbId}/{mediaType}': {
      delete: {
        tags: ['Ratings'],
        summary: 'Delete a rating',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/TmdbId' },
          { $ref: '#/components/parameters/RatingMediaType' },
          { name: 'season', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'episode', in: 'query', schema: { type: 'integer', minimum: 1 } },
        ],
        responses: { 200: { description: 'Rating deleted.' } },
      },
    },
    '/v1/lists': {
      get: {
        tags: ['Lists'],
        summary: 'List authenticated user custom lists',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Lists.' } },
      },
      post: {
        tags: ['Lists'],
        summary: 'Create a custom list',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  description: { type: 'string', maxLength: 500 },
                  isPublic: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'List created.' } },
      },
    },
    '/v1/lists/{id}': {
      get: {
        tags: ['Lists'],
        summary: 'Get a list and its items',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ListId' }],
        responses: { 200: { description: 'List detail.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
      patch: {
        tags: ['Lists'],
        summary: 'Update a custom list',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ListId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 100 },
                  description: { type: 'string', maxLength: 500 },
                  isPublic: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'List updated.' } },
      },
      delete: {
        tags: ['Lists'],
        summary: 'Delete a custom list',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ListId' }],
        responses: { 200: { description: 'List deleted.' } },
      },
    },
    '/v1/lists/{id}/items': {
      post: {
        tags: ['Lists'],
        summary: 'Add or update a list item',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ListId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/ItemInput' },
                  { type: 'object', properties: { position: { type: 'integer', default: 0 } } },
                ],
              },
            },
          },
        },
        responses: { 201: { description: 'List item stored.' } },
      },
    },
    '/v1/lists/{id}/items/{tmdbId}/{mediaType}': {
      delete: {
        tags: ['Lists'],
        summary: 'Remove a list item',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ListId' }, { $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        responses: { 200: { description: 'Item removed.' } },
      },
    },
    '/v1/lists/{id}/items/reorder': {
      patch: {
        tags: ['Lists'],
        summary: 'Reorder list items',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ListId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['id', 'position'],
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        position: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Items reordered.' } },
      },
    },
    '/v1/items/{tmdbId}/{mediaType}/status': {
      get: {
        tags: ['Items'],
        summary: 'Get unified private item status',
        description: 'Returns favorite, watchlist, watched, rating, and watchedBySeason data in one request. Used by Next.js compatibility routes as backend-first source.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/TmdbId' }, { $ref: '#/components/parameters/MediaType' }],
        responses: { 200: { description: 'Unified item status.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemStatus' } } } } },
      },
    },
    '/v1/tmdb/movie/{id}': {
      get: {
        tags: ['TMDb'],
        summary: 'Get TMDb movie details with cached append_to_response data',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        responses: { 200: { description: 'TMDb movie response.', content: { 'application/json': { schema: { $ref: '#/components/schemas/TmdbResponse' } } } } },
      },
    },
    '/v1/tmdb/tv/{id}': {
      get: {
        tags: ['TMDb'],
        summary: 'Get TMDb TV details with cached append_to_response data',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        responses: { 200: { description: 'TMDb TV response.' } },
      },
    },
    '/v1/tmdb/person/{id}': {
      get: {
        tags: ['TMDb'],
        summary: 'Get TMDb person details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        responses: { 200: { description: 'TMDb person response.' } },
      },
    },
    '/v1/tmdb/search': {
      get: {
        tags: ['TMDb'],
        summary: 'Search TMDb',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['multi', 'movie', 'tv', 'person'], default: 'multi' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        ],
        responses: { 200: { description: 'TMDb search response.' } },
      },
    },
    '/v1/tmdb/discover/movies': {
      get: {
        tags: ['TMDb'],
        summary: 'Proxy TMDb discover movie',
        parameters: [{ name: 'any', in: 'query', schema: { type: 'string' }, description: 'Any TMDb discover query param is forwarded.' }],
        responses: { 200: { description: 'TMDb discover movie response.' } },
      },
    },
    '/v1/tmdb/discover/tv': {
      get: {
        tags: ['TMDb'],
        summary: 'Proxy TMDb discover TV',
        parameters: [{ name: 'any', in: 'query', schema: { type: 'string' }, description: 'Any TMDb discover query param is forwarded.' }],
        responses: { 200: { description: 'TMDb discover TV response.' } },
      },
    },
    '/v1/tmdb/trending': {
      get: {
        tags: ['TMDb'],
        summary: 'Get TMDb trending',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['all', 'movie', 'tv'], default: 'all' } },
          { name: 'window', in: 'query', schema: { type: 'string', enum: ['day', 'week'], default: 'week' } },
        ],
        responses: { 200: { description: 'TMDb trending response.' } },
      },
    },
    '/v1/tmdb/{type}/{id}/providers': {
      get: {
        tags: ['TMDb'],
        summary: 'Get TMDb watch providers',
        parameters: [
          { name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['movie', 'tv'] } },
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          { name: 'region', in: 'query', schema: { type: 'string', default: 'ES' } },
        ],
        responses: { 200: { description: 'TMDb providers response.' } },
      },
    },
    '/v1/import/trakt': {
      post: {
        tags: ['Import'],
        summary: 'Start Trakt import for authenticated user',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['accessToken'],
                properties: { accessToken: { type: 'string', description: 'Temporary Trakt access token used only for import.' } },
              },
            },
          },
        },
        responses: { 202: { description: 'Import started.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/v1/import/trakt/status': {
      get: {
        tags: ['Import'],
        summary: 'Get current Trakt import status',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Import status.' } },
      },
    },
    '/v1/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Get basic user stats',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Stats summary.' } },
      },
    },
    '/v1/stats/calendar': {
      get: {
        tags: ['Stats'],
        summary: 'Get calendar watch counts',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { 200: { description: 'Calendar stats.' } },
      },
    },
    '/v1/stats/shows/in-progress': {
      get: {
        tags: ['Stats'],
        summary: 'Get shows watched recently that may be in progress',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'In-progress shows.' } },
      },
    },
    '/v1/stats/shows/completed': {
      get: {
        tags: ['Stats'],
        summary: 'Get shows with watched episodes',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Completed shows candidate list.' } },
      },
    },
  },
};
