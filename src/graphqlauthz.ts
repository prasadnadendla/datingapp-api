
import { parse, FieldNode } from 'graphql';

// Define allowed operations and fields
type AutofillRules = Record<string, Record<string, string>>;

interface PolicyEntry {
    allowed: string[];
    autofill?: AutofillRules;
    restrictedFields?: Record<string, string[]>;
    requireWhere?: boolean;
    requireOwnership?: Record<string, string[]>; // operation → fields where at least one must equal userId
}

interface GraphQLPolicy {
    query: PolicyEntry;
    mutation: PolicyEntry;
    subscription: PolicyEntry;
}

const GRAPHQL_POLICY: GraphQLPolicy = {
    query: {
        allowed: ['da_users', 'da_users_by_pk', 'da_swipes', 'da_matches'],
        autofill: {
            da_communities: { uid: 'userId' },
            da_matches: { user1_id: 'userId', user2_id: 'userId' }
        },
        restrictedFields: {
            da_users: ['secret', 'password', 'email', 'phone'],
            da_communities: ['user.secret', 'user.password', 'user.email', 'user.phone'],
        },
        requireWhere: true
    },
    mutation: {
        allowed: ['update_da_users_by_pk', 'insert_da_swipes_one'],
        autofill: {
            update_da_users_by_pk: { id: 'userId' },
            insert_da_swipes_one: { user_id: 'userId' },     // always set swipe.user_id from JWT
        },
    },
    subscription: { allowed: [] },
};



export const authorizeGraphQL = (req: any, res: any, done: any) => {
    // Placeholder for future authorization logic
    // check from support system or main app
    const user = req.user as object & { uid: string }
    if (!user) {
        res.status(401).send({ error: "Unauthorized" })
        return;
    }

    const body = req.body;
    if (!body || typeof body.query !== 'string') return;

    let ast;
    try {
        ast = parse(body.query);
    } catch (err: any) {
        res.code(400).send({ error: 'Invalid GraphQL syntax', details: err.message });
        return;
    }
    const userId = user?.uid;
    const variables = body.variables || {};
    // Iterate through operations in the query
    for (const def of ast.definitions) {
        if (def.kind !== 'OperationDefinition') continue;

        const operationType = def.operation; // query | mutation | subscription
        const policy = GRAPHQL_POLICY[operationType] || {};

        const selections = def.selectionSet?.selections || [];
        for (const fieldSel of selections) {
            if (fieldSel.kind !== 'Field') continue;
            const field = fieldSel;
            const fieldName = field.name.value;

            // Access Validation: is this field allowed?
            if (!policy.allowed?.includes(fieldName)) {
                res.code(403).send({
                    error: `Access to ${operationType} '${fieldName}' is not allowed`,
                });
                return;
            }

            // 🚫 Validate restricted subfields for queries
            if (operationType === 'query' && policy.restrictedFields?.[fieldName]) {
                const restricted = policy.restrictedFields[fieldName];
                const selectedSubfields =
                    field.selectionSet?.selections
                        .filter((sel): sel is FieldNode => sel.kind === 'Field')
                          .flatMap((sel) => collectFields(sel)) || [];

                const restrictedUsed = selectedSubfields.filter((s) =>
                    restricted.includes(s)
                );

                if (restrictedUsed.length > 0) {
                    res.code(403).send({
                        error: `Restricted fields in '${fieldName}' query: ${restrictedUsed.join(
                            ', '
                        )}`,
                    });
                    return;
                }

            }
            //Enforce `where` presence for queries
            if (operationType === 'query' && policy.requireWhere && !fieldName.endsWith('_by_pk')) {
                const whereArg = field.arguments?.find(
                    (arg) => arg.name.value === 'where' || 'args'
                );

                if (!whereArg) {
                    res.code(400).send({
                        error: `Missing required 'where' argument for query '${fieldName}'`,
                    });
                    return;
                }
                // Ensure it's using a variable named "where"
                if (whereArg.value.kind !== 'Variable' || !(whereArg.value.name.value == 'where' || whereArg.value.name.value == 'args')) {
                    res.code(400).send({
                        error: `'where' argument must be a variable named 'where' for query '${fieldName}'`,
                    });
                    return;
                }

                // Optionally, ensure the variable exists in body.variables
                if (!(variables.where || variables.args)) {
                    res.code(400).send({
                        error: `Variable 'where' is missing in the request for query '${fieldName}'`,
                    });
                    return;
                }
            }
            //  Enrichment: should we auto-fill anything?
            const autofillRules = policy.autofill?.[fieldName];
            if (autofillRules) {
                for (const [fieldToFill, source] of Object.entries(autofillRules)) {
                    if (source === 'userId' && userId) {
                        if (variables.object) {
                            // Insert mutations: fill inside object
                            variables.object[fieldToFill] = userId;
                        } else if (variables.args) {
                            variables.args[fieldToFill] = userId;
                        } else if (variables.where) {
                            // If field already exists in the where tree, overwrite its value (prevent spoofing)
                            // Otherwise add it at the top level
                            const found = deepFillField(variables.where, fieldToFill, userId);
                            if (!found) {
                                variables.where[fieldToFill] = { _eq: userId };
                            }
                        } else {
                            // Top-level variable (e.g., update_by_pk with $id)
                            variables[fieldToFill] = userId;
                        }
                    }
                }
            }

            // Ownership check: at least one of the specified fields must equal the logged-in userId
            const ownershipFields = policy.requireOwnership?.[fieldName];
            if (ownershipFields && userId) {
                const obj = variables.object || variables;
                const ownerMatch = ownershipFields.some((f) => obj[f] === userId);
                if (!ownerMatch) {
                    res.code(403).send({
                        error: `Ownership violation: one of [${ownershipFields.join(', ')}] must be the authenticated user`,
                    });
                    return;
                }
            }
        }
    }

    // replace modified variables
    body.variables = variables;
    done();
}

/** Recursively walk a where object; if `field` is found, overwrite its _eq with `value`. Returns true if found. */
function deepFillField(where: any, field: string, value: string): boolean {
    if (!where || typeof where !== 'object') return false;

    let found = false;

    // Direct match at this level
    if (field in where) {
        if (typeof where[field] === 'object' && where[field] !== null) {
            where[field]._eq = value;
        } else {
            where[field] = { _eq: value };
        }
        found = true;
    }

    // Recurse into logical operators (_and, _or, _not) and nested relations
    for (const key of Object.keys(where)) {
        const val = where[key];
        if (Array.isArray(val)) {
            for (const item of val) {
                if (deepFillField(item, field, value)) found = true;
            }
        }
    }

    return found;
}

function collectFields(
  field: FieldNode,
  parentPath: string[] = []
): string[] {
  const currentPath = [...parentPath, field.name.value];

  // If no nested selection, this is a leaf → return the path
  if (!field.selectionSet) {
    return [currentPath.join('.')];
  }

  // Otherwise recurse into children
  return field.selectionSet.selections
    .filter((sel): sel is FieldNode => sel.kind === 'Field')
    .flatMap((sel) => collectFields(sel, currentPath));
}