Run `npm run build` in the datingapp-api project and fix all TypeScript errors.

Steps:
1. Run `npm run build` from the project root
2. If there are errors, fix them one by one:
   - Type mismatches: add proper types or use type assertions where Apollo returns `any`
   - Missing imports: add the import statement
   - Unused variables: remove or prefix with `_`
3. Rebuild and repeat until zero errors
4. Report any warnings
