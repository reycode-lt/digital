import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || "reycode-development-secret"
);

export async function createToken(payload) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret);
}

export async function verifyToken(token) {
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        return null;
    }
}

export function setAuthCookie(res, token) {
    res.setHeader(
        "Set-Cookie",
        `reycode_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );
}

export function clearAuthCookie(res) {
    res.setHeader(
        "Set-Cookie",
        "reycode_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );
}

export function getAuthToken(req) {
    const cookies = req.headers.cookie || "";

    const match = cookies
        .split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith("reycode_token="));

    return match ? decodeURIComponent(match.split("=")[1]) : null;
}