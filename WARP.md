# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

This is a Node.js/Express HTTP API that uses:
- ESM modules (`"type": "module"` in `package.json`)
- Path aliases defined via Node `imports` (e.g. `#config/*`, `#services/*`, `#models/*`)
- PostgreSQL via Neon serverless and Drizzle ORM
- Zod for request validation
- Winston + Morgan for logging
- JWT + HTTP-only cookies for auth/session handling

The main entrypoint is `src/index.js`, which loads environment variables and starts the HTTP server defined in `src/server.js`/`src/app.js`.

## Installation & environment

- Install dependencies (npm is the default package manager, see `package-lock.json`):
  - `npm install`
- Required environment variables (used in code/config):
  - `DATABASE_URL` – PostgreSQL connection string used by Neon + Drizzle (`drizzle.config.js`, `src/config/database.js`)
  - `PORT` (optional) – HTTP port; defaults to `3000` if unset (`src/server.js`)
  - `JWT_SECRET` (optional) – secret for signing/verifying JWTs (`src/utils/jwt.js`); hard-coded fallback exists but should be overridden
  - `NODE_ENV` (optional) – toggles logger console transport and secure cookie behavior
  - `LOG_LEVEL` (optional) – Winston log level (`src/config/logger.js`)

## Common commands

All commands are run from the repo root.

### Development server

- Start the dev server with file watching (entry: `src/index.js`):

  ```bash path=null start=null
  npm run dev
  ```

  This will:
  - Load environment variables via `dotenv/config`
  - Import `src/server.js`, which mounts the Express app from `src/app.js` and listens on `PORT`/`3000`.

### Linting & formatting

- Lint the codebase with ESLint (configured via `eslint.config.js`):

  ```bash path=null start=null
  npm run lint
  ```

- Auto-fix lint issues where possible:

  ```bash path=null start=null
  npm run lint:fix
  ```

- Format the codebase with Prettier:

  ```bash path=null start=null
  npm run format
  ```

- Check formatting without writing changes:

  ```bash path=null start=null
  npm run format:check
  ```

### Database (Drizzle ORM)

Drizzle is configured via `drizzle.config.js` to use PostgreSQL with schemas in `src/models/*.js`. It relies on `DATABASE_URL`.

- Generate SQL migrations from the current schema:

  ```bash path=null start=null
  npm run db:generate
  ```

- Apply migrations to the database:

  ```bash path=null start=null
  npm run db:migrate
  ```

- Open the Drizzle Studio UI (browser-based DB explorer):

  ```bash path=null start=null
  npm run db:studio
  ```

### Testing

There is currently no test runner or `npm test` script defined in `package.json`, and no `tests/` directory in the repo. If you introduce a test framework (e.g., Jest or Vitest), add appropriate scripts to `package.json` (including how to run a single test) and update this section.

## High-level architecture

### Entry & server lifecycle

- `src/index.js`
  - Imports `dotenv/config` to load environment variables.
  - Imports `src/server.js` to start the HTTP server.

- `src/server.js`
  - Imports the Express app from `src/app.js`.
  - Reads `PORT` from `process.env.PORT` (fallback `3000`).
  - Calls `app.listen(PORT, ...)` and logs the listening URL.

### Express app composition (`src/app.js`)

`src/app.js` constructs and configures the Express application:

- Global middleware:
  - `helmet()` for basic security headers
  - `cors()` for CORS handling
  - JSON and URL-encoded body parsers
  - `cookie-parser` for cookie support
  - `morgan('combined')` HTTP logging, wired into the custom Winston logger (`#config/logger.js`)
- Health and root routes:
  - `GET /` – simple hello route that logs via the logger.
  - `GET /health` – health check endpoint returning status, timestamp, and process uptime.
  - `GET /api` – basic API liveness message.
- Feature routes:
  - `app.use('/api/auth', authRoutes)` – mounts the auth router from `src/routes/auth.routes.js` under the `/api/auth` prefix.

### Configuration layer (`src/config`)

- `src/config/logger.js`
  - Creates a Winston logger with JSON logs and timestamps.
  - Writes to `logs/error.lg` and `logs/combined.log`.
  - Adds a colorized console transport in non-production environments.
  - `LOG_LEVEL` and `NODE_ENV` control behavior.

- `src/config/database.js`
  - Uses Neon (`@neondatabase/serverless`) to create a Postgres client from `DATABASE_URL`.
  - Wraps that client with Drizzle (`drizzle-orm/neon-http`).
  - Exports `db` (used by services) and `sql` (raw access if needed).

### Domain modules

The codebase uses a typical layered approach for the auth domain:

- **Routes** – map HTTP paths to controllers
  - `src/routes/auth.routes.js`
    - Defines the `/sign-up`, `/sign-in`, and `/sign-out` POST routes.
    - This router is mounted under `/api/auth` in the app, so the effective paths are `/api/auth/sign-up`, etc.

- **Controllers** – handle HTTP-level concerns
  - `src/controllers/auth.controller.js`
    - `signup` controller:
      - Validates the request body with `signUpSchema` from `#validations/auth.validation.js`.
      - On validation failure, uses `formatValidator` from `#utils/format.js` to shape error output and returns `400`.
      - On success, calls `createUser` from `#services/auth.service.js` with the parsed data.
      - Signs a JWT for the created user and sets it in a cookie (via the cookies helper from `#utils/cookies.js`).
      - Logs the signup event via the logger and returns a `201` with basic user info.
      - Delegates unexpected errors to the Express error handler via `next(error)`.

- **Services** – business logic and database access
  - `src/services/auth.service.js`
    - `hashPassword(password)` – hashes passwords with bcrypt (10 salt rounds), logs and wraps failures.
    - `createUser({ name, email, password, role })` – core user-creation flow:
      - Uses Drizzle (`db.select().from(users).where(eq(users.email, email))`) to check for an existing user by email.
      - Throws a sentinel error if the user already exists.
      - Hashes the password and inserts a new row into the `users` table.
      - Returns a subset of user fields (id, name, email, role, created_at) and logs the creation.

- **Models** – database schema definition
  - `src/models/user.model.js`
    - Defines the `users` table using Drizzle `pgTable` with columns: `id`, `name`, `email` (unique), `password`, `role` (default `user`), `createdAt`, `updatedAt`.
    - This schema is used both at runtime via Drizzle and by `drizzle-kit` for migration generation.

- **Validation schemas** – input validation
  - `src/validations/auth.validation.js`
    - `signUpSchema` – validates name/email/password/role and enforces lengths and allowed roles (`user` or `admin`).
    - `signInSchema` – validates sign-in payload (`email`, `password`).

### Utility modules (`src/utils`)

- `src/utils/cookies.js`
  - Provides a small abstraction over `res.cookie`/`res.clearCookie` with shared default options:
    - `httpOnly` cookies
    - `secure` in production
    - `sameSite: 'Lax'`
    - default `maxAge` of 15 minutes
  - Exposes helper methods: `getOptions`, `set`, `clear`, and `get`.

- `src/utils/jwt.js`
  - Wraps `jsonwebtoken` to manage signing and verifying JWT tokens:
    - `jwttoken.sign(payload)` – signs with `JWT_SECRET` (or a default), `expiresIn: '1h'`, logs and throws on failure.
    - `jwttoken.verify(token)` – verifies the token and logs/throws on failure.
  - Uses the shared logger to record issues with token operations.

- `src/utils/format.js`
  - Intended to format Zod validation errors into a user-friendly string for HTTP responses.
  - When modifying this file, keep in mind it is used by controllers to shape validation error responses for client consumption.

### Module resolution and imports

- `package.json` defines `imports` aliases like `#config/*`, `#controllers/*`, `#models/*`, `#services/*`, `#utils/*`, and `#validations/*`.
- When adding new modules under these directories, prefer using the aliases rather than relative paths (e.g., `import logger from '#config/logger.js';`).
- Any new top-level directories that should have aliases must be added to `package.json` under `imports`.

### ESLint configuration

- ESLint is configured via a flat config (`eslint.config.js`) using `@eslint/js` recommended rules, with custom rules for style (2-space indent, single quotes, semicolons, forbidding `var`, etc.).
- The config declares Jest-style globals for files under `tests/**/*.js`, which are currently not present in the repo.
- The following paths are ignored by ESLint: `node_modules/**`, `coverage/**`, `logs/**`, `drizzle/**`.

## Notes for future Warp agents

- Respect the ESM setup (`"type": "module"`) and path aliases when generating or editing imports.
- Keep the Express layering consistent: routes → controllers → services → models, with Zod validation and shared utilities where appropriate.
- When introducing tests, update `package.json` scripts and this WARP.md with how to run the full suite and individual tests.
- When changing the database schema in `src/models`, run the Drizzle commands (`db:generate`, `db:migrate`) and ensure migrations stay in sync with the model definitions.
