
import { ApolloClient, gql, InMemoryCache, HttpLink } from "@apollo/client/core"
import * as AppConfig from '../conf/config.json';
import { getLogger } from "../log"
import { toSnakeCase } from "../validator";
const log = getLogger();
const client = new ApolloClient({
    link: new HttpLink({
        uri: AppConfig.graphql.endpoint,
        headers: {
            "x-hasura-admin-secret": `${AppConfig.secretKey}`
        }
    }),
    cache: new InMemoryCache(), //disable cache by using a fresh instance
    defaultOptions: {
        watchQuery: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'ignore',
        },
        query: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'all',
        },
    }
});

export const getUser = async (phoneNumber: string) => {
    const response = await client.query({
        query: gql`query getUser($phone: String!) {
                da_users(where: {phone: {_eq: $phone}}) {
                    id
                    secret
                    is_active
                    blocked
                    name
                    email
                    is_deleted
                    roles
                }
                }`,
        variables: { phone: phoneNumber }
    })
    if (response.error) {
        log.error(response.error);
        return null;
    }
    return (response as any).data.da_users[0] || null;
}

export const getUserById = async (userId: string) => {
    const response = await client.query({
        query: gql`query getUser($id: uuid!) {
                da_users_by_pk(id: $id) {
                    id
                    secret
                    is_active
                    blocked                    
                    name
                    email
                    is_deleted
                    roles
                }
                }`,
        variables: { id: userId }
    })

    return (response as any).data.da_users_by_pk || null;
}


export const createUser = async (phoneNumber: string, secret: string, location: any) => {
    const response = await client.mutate({
        mutation: gql`mutation createUser($object: da_users_insert_input!) {
                insert_da_users_one(object: $object) {  
                        id   
                }
            }`,
        variables: { object: { phone: phoneNumber, secret, name: "Unknown", location, city: location?.city, state: location?.state } }
    })
    //TODO: add new user to cache?
    return (response as any).data.insert_da_users_one.id || null;
}


export const activateUser = async (userId: string) => {
    const response = await client.mutate({
        mutation: gql`mutation activateUser($id: uuid!) {
                update_da_users_by_pk(pk_columns: {id: $id}, _set: {is_active: true}) {
                    id        
                }
            }`,
        variables: { id: userId }
    })
    return (response as any).data.update_da_users_by_pk || null;
}

export const updateUserProfile = async (name: string, purpose: string[], userId: string, details?: any) => {
    const set: any = { name, roles: purpose };
    if (details && purpose.includes("Developer")) {
        if (details.logo) set.image = details.logo
        if (details.location) set.city = details.location
        if (details.founded) set.founded_year = details.founded
    }
    const response = await client.mutate({
        mutation: gql`mutation updateUserProfile($id: uuid!, $set: da_users_set_input!) {
            update_da_users_by_pk(pk_columns: {id: $id}, _set: $set) {
                id
            }
            }`,
        variables: { id: userId, set }
    })
    return (response as any).data.update_da_users_by_pk || null;
}

export const updateUserDetails = async (name: string, email: string, userId: string) => {
    const response = await client.mutate({
        mutation: gql`mutation updateUserProfile($id: uuid!, $set: da_users_set_input!) {
                update_da_users_by_pk(pk_columns: {id: $id}, _set: $set) {
                    id                    
                }
            }`,
        variables: { id: userId, set: email ? { name, email } : { name } }
    })
    return (response as any).data.update_da_users_by_pk || null;
}

export const deleteUser = async (userId: string) => {
    const response = await client.mutate({
        mutation: gql`mutation deleteUser($id: uuid!) {
                update_da_users_by_pk(pk_columns:{id: $id}, _set: {is_deleted: true}) {
                    id                    
                }
            }`,
        variables: { id: userId }
    })
    return (response as any).data.update_da_users_by_pk || null;
}


export const saveToken = async (userId: string, token: string, location: any) => {
    const response = await client.mutate({
        mutation: gql`mutation saveToken($object: da_tokens_insert_input!) {
                insert_da_tokens_one(object: $object) {  
                        id   
                }
            }`,
        variables: { object: { uid: userId, token, location } }
    })
    return (response as any).data.insert_da_tokens_one.id || null;
}

export const onboardUser = async (userId: string, name: string, intent: string, details: {
    age: number; gender: string; city: string; photos: string[]; tags: string[]; motherTongue?: string;
}) => {
    const set = {
        name,
        intent,
        age: details.age,
        gender: details.gender,
        city: details.city,
        photos: details.photos,
        tags: details.tags,
        mother_tongue: details.motherTongue || null,
        is_onboarded: true,
    };
    const response = await client.mutate({
        mutation: gql`mutation onboardUser($id: uuid!, $set: da_users_set_input!) {
            update_da_users_by_pk(pk_columns: {id: $id}, _set: $set) {
                id name age gender city photos tags mother_tongue intent
                is_onboarded is_verified is_premium voice_intro_url
                education profession religion community
            }
        }`,
        variables: { id: userId, set }
    });
    return (response as any).data.update_da_users_by_pk || null;
}

export const getUserProfile = async (userId: string) => {
    const response = await client.query({
        query: gql`query getUserProfile($id: uuid!) {
            da_users_by_pk(id: $id) {
                id name phone age gender city photos tags mother_tongue intent
                is_onboarded is_verified verified_type is_premium spark_pass_expiry
                voice_intro_url education profession religion community
            }
        }`,
        variables: { id: userId }
    });
    return (response as any).data.da_users_by_pk || null;
}

export const updateDatingProfile = async (userId: string, set: Record<string, any>) => {
    const response = await client.mutate({
        mutation: gql`mutation updateDatingProfile($id: uuid!, $set: da_users_set_input!) {
            update_da_users_by_pk(pk_columns: {id: $id}, _set: $set) {
                id name age gender city photos tags mother_tongue intent
                is_onboarded is_verified is_premium voice_intro_url
                education profession religion community
            }
        }`,
        variables: { id: userId, set }
    });
    return (response as any).data.update_da_users_by_pk || null;
}


export const checkChatPermission = async (userId: string, targetId: string) => {
    const response = await client.query({
        query: gql`query checkChatPermission($userId: uuid!, $targetId: uuid!) {
            da_matches(where: {
                    _or: [
                        {user1_id: {_eq: $userId}, user2_id: {_eq: $targetId}}
                        {user1_id: {_eq: $targetId}, user2_id: {_eq: $userId}}
                    ]

            }) {
                id
            }
        }`,
        variables: { userId, targetId }
    });
    return (response as any).data.da_matches.length > 0;
}


export const checkReciprocalSwipe = async (userId: string, targetId: string): Promise<boolean> => {
    const response = await client.query({
        query: gql`query checkReciprocal($targetId: uuid!, $userId: uuid!) {
            da_swipes(where: {
                user_id: {_eq: $targetId},
                target_id: {_eq: $userId},
                action: {_in: ["like", "super_like"]}
            }) {
                id
            }
        }`,
        variables: { targetId, userId }
    });
    return ((response as any).data.da_swipes?.length ?? 0) > 0;
}

export const createMatch = async (user1Id: string, user2Id: string) => {
    try {
        const response = await client.mutate({
            mutation: gql`mutation createMatch($object: da_matches_insert_input!) {
                insert_da_matches_one(object: $object) {
                    id
                }
            }`,
            variables: { object: { user1_id: user1Id, user2_id: user2Id } }
        });
        return (response as any).data.insert_da_matches_one || null;
    } catch (error: any) {
        if (error.message?.includes('Uniqueness violation')) {
            return null;
        }
        throw error;
    }
}

export const getMatches = async (userId: string) => {
    const response = await client.query({
        query: gql`query getMatches($userId: uuid!) {
            da_matches(where: {
            _or: [
                        {user1_id: {_eq: $userId}}
                        {user2_id: {_eq: $userId}}
                    ]
            }) {
                id
                user1_id
                user2_id
            }
        }`,
        variables: { userId }
    });
    return (response as any).data.da_matches || null;

}



export const executeQuery = async (query: string, variables: any = {}) => {
    try {
        const response = await client.query({
            query: gql`${query}`,
            variables: toSnakeCase(variables)
        });
        return response as any;
    } catch (error: any) {
        log.error(`Error executing query: ${error.message}`);
        throw error;
    }
}

export const executeMutation = async (mutation: string, variables: any = {}) => {
    try {
        const response = await client.mutate({
            mutation: gql`${mutation}`,
            variables: toSnakeCase(variables, 1)
        });
        return response as any;
    } catch (error: any) {
        log.error(`Error executing mutation: ${error.message}`);
        throw error;
    }
}
// src/db/queries.ts

/**
 * 
 * @param ip
 * @returns {Promise<any>}
 */

export async function getGeoLocation(ip: string) {
    try {
        const url = `http://${AppConfig['ipinfo'].domain}/json/${ip}?fields=status,message,countryCode,region,city,zip,lat,lon,timezone,offset,currency,isp,org,as,mobile,proxy,hosting,query`;
        const response = await fetch(url, { method: "GET" });
        return await response.json();
    } catch (ex: any) {
        log.error(`Unable to get country info for ${ip}. details ${ex.message}`)
    }
}

