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
    { size: 1280, suffix: '' },
    { size: 1920, suffix: '_1920' },
    // { size: 2560, suffix: '_2560' },
    { size: 640, suffix: '_640' },
    { size: 384, suffix: '_384' },
    { size: 200, suffix: '_200' }
];


export async function uploadImage(buffer: Buffer<ArrayBufferLike>,ref?:string,is360?:boolean): Promise<{url:string} | { error: string }> {
    const baseName = crypto.randomBytes(20).toString('hex');
    const folder = `${rootFolder}/${ref?ref:''}`;
    const uploadPromises = SIZES.map(async ({ size, suffix }) => {
        const fileName = `${baseName}${suffix}.webp`;
        const file = bucket.file(`${folder}/${fileName}`);

        // Create a fresh sharp pipeline for each size from the original buffer
        const pipeline = sharp(buffer)
            .rotate()
            .resize(is360 && size === 1920?{width: 4096, height: 2048}:{
                width: size,
                height: size,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: is360 && size === 1920? 85 :size >= 640 ? 80 : 75 });

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