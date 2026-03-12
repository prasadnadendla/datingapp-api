Add a new REST API endpoint to the Fastify server.

Arguments: $ARGUMENTS (HTTP method, path, description, and whether it requires auth)

Steps:
1. Add a Zod validation schema to `src/models/middleware.ts` for the request body/params
2. Add any needed DB queries to `src/db/queries.ts` using **Hasura auto-generated GQL syntax**:
   - `da_<table>_by_pk(id: $id)` for single-row fetch
   - `update_da_<table>_by_pk(pk_columns: {id: $id}, _set: $set)` for updates
   - `insert_da_<table>_one(object: $object)` for inserts
   - Field names in GQL queries must be **snake_case** (matching DB columns)
3. Add route handler in `src/index.ts`:
   - Use `preHandler: [fastify.authenticate]` for protected routes
   - Validate with `validate(Schema, req.body)` — return 400 on failure
   - Extract `userId` from `(req.user as any).uid` for authenticated routes
   - Return camelCase response using `toUserResponse()` helper if returning user data
   - Proper error handling: try/catch, log errors, return appropriate HTTP codes
4. Build with `npm run build` to verify no TypeScript errors
