# Genzyy API — datingapp-api

Backend API for the Genzyy dating app. Fastify 5 server with JWT auth, OTP login, GraphQL proxy to Hasura, and GCS image uploads.

## Commands

```bash
npm run local          # dev server with nodemon (localhost:3003)
npm run build          # TypeScript compile to dist/
npm start              # run compiled dist/index.js
npm run dist           # clean + build + copy assets
```

## Architecture

- **Fastify 5** — HTTP server with CORS, JWT, rate limiting, multipart uploads
- **Hasura GraphQL** — Apollo Client connects to Hasura with admin secret; frontend queries proxied via `/api/graph`
- **JWT auth** — `@fastify/jwt` with HS256; tokens contain `{ uid: userId }`
- **OTP login** — TOTP-based via `otpauth` library, delivered via 2Factor.in SMS gateway
- **Image uploads** — `@fastify/multipart` + Sharp for processing + Google Cloud Storage
- **GraphQL Authorization** — `graphqlauthz.ts` parses and validates GraphQL AST before proxying to Hasura

## Project Structure

```
src/
├── index.ts               # Fastify server, all route definitions
├── db/
│   └── queries.ts         # Apollo Client → Hasura (all DB operations)
├── models/
│   └── middleware.ts       # Zod validation schemas
├── conf/
│   ├── config.json        # App config (endpoints, secrets) — DO NOT COMMIT
│   ├── google-service-account.json   # GCS credentials — DO NOT COMMIT
│   └── storage-service-account.json  # Storage credentials — DO NOT COMMIT
├── otp/
│   └── twofactor.ts       # 2Factor.in SMS OTP delivery
├── graphqlauthz.ts        # GraphQL policy enforcement (allowed ops, field restrictions, autofill)
├── validator.ts           # Zod validate helper, TOTP instance factory, toSnakeCase util
├── log.ts                 # Fastify logger singleton
└── utils.ts               # Error message parser
```

## Database

- **PostgreSQL** via Hasura (`da` schema)
- Tables: `da.users`, `da.tokens`, `da.pushsubs`, `da.web_pushsubs`, `da.android_pushsubs`
- Schema definition in `dbschema.sql`
- All DB column names are **snake_case**: `mother_tongue`, `voice_intro_url`, `is_verified`, `spark_pass_expiry`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/signin` | No | Send OTP to phone number |
| POST | `/verify` | No | Verify OTP, return JWT + user profile |
| POST | `/api/onboard` | JWT | Complete onboarding (name, intent, details) |
| GET | `/api/profile` | JWT | Get current user's dating profile |
| PUT | `/api/profile` | JWT | Update dating profile fields |
| POST | `/api/image` | JWT | Upload image to GCS |
| DELETE | `/api/image` | JWT | Delete image from GCS |
| POST | `/api/graph` | JWT + graphqlauthz | Proxy GraphQL to Hasura |
| GET | `/health` | No | Health check |

## GraphQL — Hasura Syntax

All queries in `db/queries.ts` use Hasura auto-generated syntax:

### Patterns
```graphql
# Fetch by primary key
da_users_by_pk(id: $id) { ... }

# Update by primary key
update_da_users_by_pk(pk_columns: {id: $id}, _set: $set) { ... }

# Insert one
insert_da_users_one(object: $object) { ... }

# List with filters
da_users(where: { city: { _eq: $city } }) { ... }
```

### Rules
- Field names are **snake_case** in GraphQL queries (matching DB columns)
- Frontend sends **camelCase** → `toSnakeCase()` converts before Hasura
- Hasura returns **snake_case** → `toUserResponse()` in `index.ts` converts to camelCase for frontend
- Table prefix: `da_` (e.g., `da_users`, `da_tokens`)

## GraphQL Authorization (`graphqlauthz.ts`)

- Parses GraphQL AST to enforce operation-level policies
- Allowed queries: `da_users`, `da_users_by_pk`
- Allowed mutations: `update_da_users_by_pk`
- Restricted fields: `secret`, `password`, `email`, `phone` (cannot be queried via proxy)
- Autofill: injects `userId` from JWT into variables where configured
- List queries require `where` argument (prevents full table scans)

## Validation (Zod 4)

Schemas in `src/models/middleware.ts`:
- `SignIn` — phone regex `+91XXXXXXXXXX`
- `SignInVerify` — phone + 6-char code
- `OnboardSchema` — name, purpose array, nested details (age, gender, city, photos, tags)
- `UpdateProfileSchema` — optional fields for profile updates
- `Graph` — operationName, query string, variables record
- `uploadImageSchema` — file validation (type, size ≤ 5MB)
- `deleteImageSchema` — URL validation

## Code Conventions

- **Strict TypeScript** — `strict: true`; avoid `any` where possible
- **CommonJS** — `module: "commonjs"`, use `import/export` (compiled by tsc)
- **Zod 4** for all request validation — validate before processing
- **No `console.log`** in production — use `getLogger()` from `log.ts`
- **Error handling** — catch errors, log with logger, return appropriate HTTP status codes
- **snake_case ↔ camelCase** — DB/Hasura is snake_case, API responses to frontend are camelCase
- **JWT preHandler** — use `fastify.authenticate` preHandler for protected routes
- **Config** — import from `src/conf/config.json`; NEVER commit secrets
- **Route organization** — all routes defined in `src/index.ts`; group by feature with comments

## Adding New Endpoints

1. Add Zod schema to `src/models/middleware.ts`
2. Add DB query/mutation to `src/db/queries.ts` using Hasura GQL syntax
3. Add route handler in `src/index.ts` with:
   - Appropriate HTTP method and path
   - `preHandler: [fastify.authenticate]` for protected routes
   - Zod validation of request body/params
   - Error handling with proper status codes
   - camelCase response transformation if returning user data

## Adding GraphQL Proxy Operations

When allowing new operations through `/api/graph`:
1. Add the operation name to `GRAPHQL_POLICY` in `graphqlauthz.ts`
2. Configure `autofill` rules if the operation needs user context injection
3. Add `restrictedFields` if sensitive columns should be blocked
4. Set `requireWhere: true` for list queries to prevent full table scans
