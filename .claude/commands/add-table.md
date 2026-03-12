Add a new database table definition and corresponding API support.

Arguments: $ARGUMENTS (table name, columns, and purpose)

Steps:
1. Add the `CREATE TABLE` statement to `dbschema.sql` following existing conventions:
   - Schema: `da` (e.g., `da.new_table`)
   - Primary key: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - Timestamps: `created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT`
   - Foreign keys: reference `da.users(id)` with `ON DELETE CASCADE` where appropriate
   - Column names: **snake_case**
   - Add relevant indexes
2. Add Hasura queries/mutations to `src/db/queries.ts` for CRUD operations
3. Add Zod validation schemas to `src/models/middleware.ts`
4. Add API endpoints to `src/index.ts`
5. Update `GRAPHQL_POLICY` in `graphqlauthz.ts` if the table should be accessible via `/api/graph`
6. Build with `npm run build` to verify
