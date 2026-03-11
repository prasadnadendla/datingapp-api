import { FastifyBaseLogger } from "fastify";

let logger:FastifyBaseLogger;
export const getLogger = ( ) => logger;
export const setLogger = (loggerInstance:FastifyBaseLogger) => {
    logger= loggerInstance
}