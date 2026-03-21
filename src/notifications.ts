import webpush from 'web-push';
import * as admin from 'firebase-admin';
import googleServiceAccount from './conf/google-service-account.json';
import * as AppConfig from './conf/config.json';
import { getUserPushSubscriptions, removeWebPushSubscription, removeFcmToken } from './db/queries';
import { getLogger } from './log';

const log = getLogger();

webpush.setVapidDetails(
    AppConfig.vapid.subject,
    AppConfig.vapid.publicKey,
    AppConfig.vapid.privateKey
);

admin.initializeApp({
    credential: admin.credential.cert(googleServiceAccount as admin.ServiceAccount),
});

const messaging = admin.messaging();

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
                    log.warn(`Removing expired web push subscription for user ${userId}`);
                    removeWebPushSubscription(sub.endpoint).catch(() => {});
                } else {
                    log.error(err, 'Failed to send web push notification');
                }
            }
        }

        // FCM for Android subscriptions
        const androidSubs = subs.android_pushsubs ?? [];
        if (!androidSubs.length) {
            log.warn(`No FCM tokens found for user ${userId}`);
            return;
        }

        for (const sub of androidSubs) {
            try {
                await sendFcmNotification(sub.token, payload);
            } catch (err: any) {
                const code: string = err.code ?? '';
                if (
                    code.includes('registration-token-not-registered') ||
                    code.includes('invalid-registration-token') ||
                    code.includes('invalid-argument')
                ) {
                    log.warn(`Removing invalid FCM token for user ${userId}`);
                    removeFcmToken(sub.token).catch(() => {});
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
    await messaging.send({
        token,
        notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.image ? { imageUrl: payload.image } : {}),
        },
        data: payload.data
            ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, String(v)]))
            : undefined,
        android: {
            notification: {
                icon: 'ic_notification',
            },
        },
    });
}
