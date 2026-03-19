import webpush from 'web-push';
import { GoogleAuth } from 'google-auth-library';
import * as AppConfig from './conf/config.json';
import { getUserPushSubscriptions } from './db/queries';
import { getLogger } from './log';

const log = getLogger();

webpush.setVapidDetails(
    AppConfig.vapid.subject,
    AppConfig.vapid.publicKey,
    AppConfig.vapid.privateKey
);

const fcmAuth = new GoogleAuth({
    keyFile: AppConfig.s3.keyFilename,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
});
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${AppConfig.s3.projectId}/messages:send`;

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    image?: string;
    data?: Record<string, any>;
}

export async function sendPushNotification(userId: string, payload: PushPayload) {
    try {
        const subs = await getUserPushSubscriptions(userId);
        if (!subs) return;

        const notification = JSON.stringify({ notification: payload });

        // Web push subscriptions
        const webSubs = subs.web_pushsubs ?? [];
        for (const sub of webSubs) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    notification
                );
            } catch (err: any) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    log.warn(`Expired web push subscription for user ${userId}`);
                } else {
                    log.error(err, 'Failed to send web push notification');
                }
            }
        }

        // FCM for Android subscriptions
        const androidSubs = subs.android_pushsubs ?? [];
        for (const sub of androidSubs) {
            try {
                await sendFcmNotification(sub.token, payload);
            } catch (err: any) {
                if (err.message?.includes('NOT_FOUND') || err.message?.includes('UNREGISTERED')) {
                    log.warn(`Expired FCM token for user ${userId}`);
                } else {
                    log.error(err, 'Failed to send FCM notification');
                }
            }
        }
    } catch (err) {
        log.error(err, 'Failed to send push notification');
    }
}

async function sendFcmNotification(token: string, payload: PushPayload) {
    const client = await fcmAuth.getClient();
    const { token: accessToken } = await client.getAccessToken();

    const response = await fetch(FCM_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: {
                token,
                notification: {
                    title: payload.title,
                    body: payload.body,
                },
                data: payload.data
                    ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, String(v)]))
                    : undefined,
                android: {
                    notification: {
                        icon: 'ic_notification',
                        ...(payload.image ? { image: payload.image } : {}),
                    }
                }
            }
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`FCM send failed: ${response.status} ${error}`);
    }
}
