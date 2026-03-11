import { getLogger } from '../log';

const logger= getLogger()
export async function sendOTP(phone: string, code: string) {
    try {
        await fetch(`https://2factor.in/API/V1/768be78c-cf39-11f0-a6b2-0200cd936042/SMS/${phone}/${code}/genzyy`)
    } catch (ex: unknown) {
        logger.error(`failed to send otp ${ex instanceof Error ? ex.message : String(ex)}`)
    }
}