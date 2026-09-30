import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey() {
    const secret = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;

    if (!secret) {
        throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY belum diatur");
    }

    return crypto
        .createHash("sha256")
        .update(secret)
        .digest();
}

export function encryptToken(token) {
    const iv = crypto.randomBytes(12);
    const key = getKey();

    const cipher = crypto.createCipheriv(
        ALGORITHM,
        key,
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return [
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted.toString("base64")
    ].join(".");
}

export function decryptToken(value) {
    const parts = String(value || "").split(".");

    if (parts.length !== 3) {
        throw new Error("Format token terenkripsi tidak valid");
    }

    const [ivBase64, authTagBase64, encryptedBase64] = parts;

    const key = getKey();

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivBase64, "base64")
    );

    decipher.setAuthTag(
        Buffer.from(authTagBase64, "base64")
    );

    const decrypted = Buffer.concat([
        decipher.update(
            Buffer.from(encryptedBase64, "base64")
        ),
        decipher.final()
    ]);

    return decrypted.toString("utf8");
}

export function maskToken(token) {
    if (!token) return "";

    if (token.length <= 8) {
        return "••••••••";
    }

    return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}