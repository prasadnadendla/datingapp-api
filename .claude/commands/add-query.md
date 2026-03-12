Add a new Hasura GraphQL query or mutation to db/queries.ts.

Arguments: $ARGUMENTS (operation name, table, and what it does)

Requirements:
- Use **Hasura auto-generated syntax** — NOT custom resolver names
- Queries:
  - By PK: `da_<table>_by_pk(id: $id) { ... }`
  - List: `da_<table>(where: $where, order_by: $order_by, limit: $limit) { ... }`
  - Aggregate: `da_<table>_aggregate(where: $where) { aggregate { count } }`
- Mutations:
  - Update: `update_da_<table>_by_pk(pk_columns: {id: $id}, _set: $set) { ... }`
  - Insert: `insert_da_<table>_one(object: $object) { ... }`
  - Delete: `delete_da_<table>_by_pk(id: $id) { ... }`
  - Bulk update: `update_da_<table>(where: $where, _set: $set) { affected_rows }`
- **All field names must be snake_case** (matching DB columns)
- Use the existing `client` Apollo instance from the module
- Handle errors: check `response.error`, log with `log.error()`, return null on failure
- Export the function with proper TypeScript types for parameters
- Build with `npm run build` to verify
