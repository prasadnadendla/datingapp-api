Add a new allowed operation to the GraphQL authorization policy.

Arguments: $ARGUMENTS (operation type, operation name, and any special rules)

Edit `src/graphqlauthz.ts` to update `GRAPHQL_POLICY`:

1. Add the operation name to the appropriate `allowed` array (`query`, `mutation`, or `subscription`)
2. Configure **autofill** rules if the operation needs user context:
   ```typescript
   autofill: {
     operation_name: { fieldToFill: 'userId' }
   }
   ```
   - For mutations with `$object` variables: fills `variables.object[field]`
   - For queries with `$where` variables: fills `variables.where[field]._eq`
3. Add **restrictedFields** if sensitive columns should be blocked from selection:
   ```typescript
   restrictedFields: {
     operation_name: ['secret', 'password', 'email', 'phone']
   }
   ```
4. Set `requireWhere: true` for list queries to prevent full table scans (already enabled for queries)
5. Build with `npm run build` to verify
