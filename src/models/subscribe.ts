import { z } from "zod/v4";

export const Subscribe = z.object({
    endpoint: z.url().describe("push subscription endpoint").optional(),
    keys: z.object({
        p256dh: z.string().describe("p256dh key"),
        auth: z.string().describe("auth key"),
    }).optional(),
    token: z.string().trim().max(300).optional(),
    model: z.string().max(100).optional(),
    manufacturer: z.string().max(50).optional(),
    os: z.string().max(50).optional(),
    expiration_time: z.number().int().nonnegative().optional(),
}).refine((data) => {
    if (data.token && !data.model) return false;

    if (data.endpoint && !data.keys) return false;
    if (data.keys && !data.endpoint) return false;
    if (!data.endpoint && !data.token) return false;
    return true;
}, {
    message: "Either push subscription (endpoint and keys) or FCM token with device info must be provided.",
    path: ["token", "device"]
});


export type SubscribeInput = z.infer<typeof Subscribe>;

export const WebPushSubscription = z.object({
    id: z.uuid().describe("subscription id").readonly(),
    endpoint: z.url().describe("push subscription endpoint"),
    keys: z.object({
        p256dh: z.string().describe("p256dh key"),
        auth: z.string().describe("auth key"),
    }),
    expiration_time: z.number().int().nonnegative().optional(),
})

export type WebPushSubscriptionType = z.infer<typeof WebPushSubscription>;

export const AndroidPushSubscription = z.object({
    id: z.uuid().describe("subscription id").readonly(),
    token: z.string().trim().max(500),
    device: z.object({
        model: z.string().max(100).optional(),
        manufacturer: z.string().max(50),
        os: z.string().max(50)
    })
})

export type AndroidPushSubscriptionType = z.infer<typeof AndroidPushSubscription>;

export const SubscriptionSchema = z.object({
    id: z.string().readonly().describe("subscription id").optional(),
    uid: z.uuid().describe("user id"),
    webpush_subs: z.array(WebPushSubscription).optional(),
    android_subs: z.array(AndroidPushSubscription).optional(),
    timestamp: z.number().int().nonnegative().default(() => Date.now()),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;