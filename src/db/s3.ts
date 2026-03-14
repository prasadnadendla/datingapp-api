import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { getLogger } from '../log'
import crypto from 'crypto';
import * as AppConfig from '../conf/config.json';
import * as storageAcc from '../conf/storage-service-account.json'
const log = getLogger();
const storage = new Storage({projectId: AppConfig.s3.projectId, credentials:storageAcc});
const bucketName = AppConfig.s3.bucket;
const bucket = storage.bucket(bucketName);
const rootFolder = 'profiles';
const SIZES = [
    { size: 1080, suffix: '' },       // full-view: discover card, profile detail
    { size: 200, suffix: '_200' },     // thumbnail: match list, liked-me grid
];

export async function uploadImage(buffer: Buffer<ArrayBufferLike>,ref?:string): Promise<{url:string} | { error: string }> {
    const baseName = crypto.randomBytes(20).toString('hex');
    const folder = `${rootFolder}/${ref?ref:''}`;
    const uploadPromises = SIZES.map(async ({ size, suffix }) => {
        const fileName = `${baseName}${suffix}.webp`;
        const file = bucket.file(`${folder}/${fileName}`);

        const pipeline = sharp(buffer)
            .rotate()
            .resize({
                width: size,
                height: size,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: size >= 640 ? 80 : 75 });

        const webpBuffer = await pipeline.toBuffer();

        await file.save(webpBuffer, {
            metadata: {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000',
            },
            public: true,
            resumable: false,
        });
        return file;
    });

    try {
        await Promise.all(uploadPromises);

        const baseUrl = `https://storage.googleapis.com/${process.env.GCP_BUCKET_NAME}/${folder}/${baseName}.webp`;
        return {url: `${AppConfig.s3.baseUrl}${folder}/${baseName}`};
    } catch (err) {
        log.error(err);
        return { error: 'Upload failed' };
    }
}

export async function deleteImageById(imageId: string, ref?:string): Promise<boolean> {
    try {
        const deletePromises = SIZES.map(({ suffix }) => {
            const fileName = `${imageId}${suffix}.webp`;
            const file = bucket.file(`${rootFolder}/${ref?ref.concat('/'):''}${fileName}`);
            return file.delete();
        });
        await Promise.all(deletePromises);
        return true;
    } catch (err: unknown) {
        log.error(err);
        return false;
    }
}