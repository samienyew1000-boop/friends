"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvablyFair = void 0;
const crypto_1 = __importDefault(require("crypto"));
class ProvablyFair {
    static generateServerSeed() {
        return crypto_1.default.randomBytes(32).toString('hex');
    }
    static hashSeed(seed) {
        return crypto_1.default.createHash('sha256').update(seed).digest('hex');
    }
    static generateClientSeed() {
        return crypto_1.default.randomBytes(16).toString('hex');
    }
    /**
     * Generates a deterministic float outcome between 0 and 1
     * using HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${step}`)
     */
    static getStepOutcome(serverSeed, clientSeed, nonce, step) {
        const message = `${clientSeed}:${nonce}:${step}`;
        const hmac = crypto_1.default.createHmac('sha256', serverSeed).update(message).digest('hex');
        // Take first 8 characters (32 bits) and convert to float
        const sub = hmac.substring(0, 8);
        const intVal = parseInt(sub, 16);
        return intVal / 0xffffffff;
    }
}
exports.ProvablyFair = ProvablyFair;
