import { connectDB } from "./_lib/mongodb.js";
import {
    getAuthToken,
    verifyToken
} from "./_lib/auth.js";
import AlightMotionHistory from "../models/AlightMotionHistory.js";

const PROVIDER =
    "https://am.reycode.my.id/api/alightmotion";

function getUserId(payload) {
    return (
        payload?.userId ||
        payload?.id ||
        payload?.sub ||
        null
    );
}

async function providerRequest(body) {
    const response = await fetch(PROVIDER, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    let data;

    try {
        data = await response.json();
    } catch {
        data = {
            status: false,
            error: "Response provider bukan JSON."
        };
    }

    return {
        statusCode: response.status,
        data
    };
}

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        status: false,
        message
    });
}

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return sendError(
                res,
                405,
                "Method tidak diperbolehkan."
            );
        }

        const token = getAuthToken(req);

        if (!token) {
            return sendError(
                res,
                401,
                "Kamu harus login terlebih dahulu."
            );
        }

        const payload = await verifyToken(token);
        const userId = getUserId(payload);

        if (!userId) {
            return sendError(
                res,
                401,
                "Session login tidak valid."
            );
        }

        await connectDB();

        const body = req.body || {};

        const action = String(
            body.action || ""
        ).toLowerCase();

        if (
            ![
                "send-link",
                "verify-link",
                "auto",
                "history"
            ].includes(action)
        ) {
            return sendError(
                res,
                400,
                "Action tidak valid."
            );
        }

        if (action === "history") {
            const history =
                await AlightMotionHistory
                    .find({ userId })
                    .sort({ createdAt: -1 })
                    .limit(50)
                    .lean();

            return res.status(200).json({
                success: true,
                history
            });
        }

        if (action === "send-link") {
            const email = String(
                body.email || ""
            ).trim();

            if (!email) {
                return sendError(
                    res,
                    400,
                    "Email wajib diisi."
                );
            }

            const result =
                await providerRequest({
                    action: "send-link",
                    email
                });

            return res
                .status(result.statusCode)
                .json(result.data);
        }

        if (action === "verify-link") {
            const email = String(
                body.email || ""
            ).trim();

            const magicLink = String(
                body.magicLink || ""
            ).trim();

            if (!email) {
                return sendError(
                    res,
                    400,
                    "Email wajib diisi."
                );
            }

            if (!magicLink) {
                return sendError(
                    res,
                    400,
                    "Link verifikasi wajib diisi."
                );
            }

            const result =
                await providerRequest({
                    action: "verify-link",
                    email,
                    magicLink
                });

            const data = result.data;

            if (
                result.statusCode >= 200 &&
                result.statusCode < 300 &&
                data?.status === true
            ) {
                const resultData =
                    data.data || {};

                await AlightMotionHistory.create({
                    userId,
                    action: "manual",
                    email,
                    orderId:
                        resultData.orderId || "",
                    status: "success"
                });
            } else {
                await AlightMotionHistory.create({
                    userId,
                    action: "manual",
                    email,
                    status: "failed",
                    error:
                        data?.error ||
                        data?.message ||
                        "Verifikasi gagal."
                });
            }

            return res
                .status(result.statusCode)
                .json(data);
        }

        if (action === "auto") {
            const username = String(
                body.username || ""
            ).trim();

            const providerBody = {
                action: "auto"
            };

            if (username) {
                providerBody.username = username;
            }

            const result =
                await providerRequest(
                    providerBody
                );

            const data = result.data;

            if (
                result.statusCode >= 200 &&
                result.statusCode < 300 &&
                data?.status === true &&
                data?.card
            ) {
                const card = data.card;

                await AlightMotionHistory.create({
                    userId,
                    action: "auto",
                    username,
                    email: card.email || "",
                    animal:
                        card.selamat_kamu_mendapatkan_animal ||
                        "",
                    orderId:
                        card.orderId || "",
                    validUntil:
                        card.validUntil || "",
                    weblogin:
                        card.weblogin || "",
                    status: "success"
                });
            } else {
                await AlightMotionHistory.create({
                    userId,
                    action: "auto",
                    username,
                    status: "failed",
                    error:
                        data?.error ||
                        data?.message ||
                        "Auto gagal."
                });
            }

            return res
                .status(result.statusCode)
                .json(data);
        }
    } catch (error) {
        console.error(
            "[DIGITAL ALIGHT MOTION ERROR]",
            error
        );

        return res.status(500).json({
            success: false,
            status: false,
            message:
                error?.message ||
                "Terjadi kesalahan pada server."
        });
    }
}
