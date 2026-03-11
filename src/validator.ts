import { email, object } from "zod/v4";
import { TOTP } from "otpauth";

export const validate = (zodSchema: any, payload: any) => {
    const result = zodSchema.safeParse(payload);
    return result
}


export const getTotpInstance = (email: string, secret: string) => {
    return new TOTP({
        issuer: "BrowsePlaces",
        label: email,
        algorithm: "SHA3-256",
        digits: 6,
        period: 180,
        secret,
    })
}


export function toSnakeCase(object: Record<string, any>, nestedLevel = 0): Record<string, any> {
  const snakeCaseObject: Record<string, any> = {};

  for (const key in object) {
    if (!object.hasOwnProperty(key)) continue;

    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    const value = object[key];

    if (
      nestedLevel > 0 &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Recursively process one level deeper
      snakeCaseObject[snakeKey] = toSnakeCase(value, nestedLevel - 1);
    } else {
      snakeCaseObject[snakeKey] = value;
    }
  }

  return snakeCaseObject;
}
