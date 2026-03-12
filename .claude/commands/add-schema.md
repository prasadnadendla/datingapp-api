Add a new Zod validation schema to models/middleware.ts.

Arguments: $ARGUMENTS (schema name, fields, and purpose)

Requirements:
- Use **Zod 4** (`import { z } from "zod/v4"`)
- Define the schema as an exported `const` with a descriptive name (PascalCase)
- Export the inferred TypeScript type: `export type SchemaNameInput = z.infer<typeof SchemaName>`
- Common patterns in this codebase:
  - Phone: `z.string().regex(/^\+91\d{10}$/, { message: "Invalid phone number format" })`
  - UUID: use `uuid!` type in GraphQL, `z.string().uuid()` in Zod
  - Optional fields: `z.string().max(100).optional()`
  - Arrays with limits: `z.array(z.string()).max(5).default([])`
  - Enums: `z.enum(['value1', 'value2', 'value3'])`
  - Nested objects: `z.object({ ... })`
  - URL: `z.url({ message: 'Invalid URL format.' })`
  - Image file: use the existing `uploadImageSchema` pattern with MIME type + size validation
- Add clear error messages for user-facing validations
- Build with `npm run build` to verify
