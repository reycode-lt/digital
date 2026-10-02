import { connectDB } from "./_lib/mongodb.js";
import {
    getAuthToken,
    verifyToken
} from "./_lib/auth.js";

import { getChatUser } from "../lib/chat/auth.js";
import { getGroupInfo } from "../lib/chat/group.js";
import { getChatUsers } from "../lib/chat/users.js";
import {
    getMessages,
    sendMessage
} from "../lib/chat/messages.js";
import {
    updatePresence
} from "../lib/chat/presence.js";

export default async function handler(
    req,
    res
) {
    if (
        req.method !== "GET" &&
        req.method !== "POST"
    ) {
        return res.status(405).json({
            success: false,
            message:
                "Method tidak diizinkan"
        });
    }

    try {
        const token = getAuthToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Belum login"
            });
        }

        const payload =
            await verifyToken(token);

        if (!payload?.userId) {
            return res.status(401).json({
                success: false,
                message:
                    "Session tidak valid"
            });
        }

        await connectDB();

        const user = await getChatUser(
            payload.userId
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    "User tidak ditemukan"
            });
        }

        const action = String(
            req.method === "GET"
                ? req.query?.action || ""
                : req.body?.action || ""
        )
            .trim()
            .toLowerCase();

        if (action === "group") {
            const group =
                await getGroupInfo();

            return res.status(200).json({
                success: true,
                group
            });
        }

        if (action === "users") {
            const users =
                await getChatUsers();

            return res.status(200).json({
                success: true,
                users
            });
        }

        if (action === "messages") {
            const messages =
                await getMessages({
                    limit:
                        req.query?.limit ||
                        req.body?.limit ||
                        50,
                    before:
                        req.query?.before ||
                        req.body?.before ||
                        null
                });

            return res.status(200).json({
                success: true,
                ...messages
            });
        }

        if (action === "heartbeat") {
            const presence =
                await updatePresence(
                    user.id
                );

            return res.status(200).json({
                success: true,
                presence
            });
        }

        if (action === "send") {
            const created =
                await sendMessage(
                    user.id,
                    req.body?.message
                );

            await updatePresence(
                user.id
            );

            return res.status(201).json({
                success: true,
                message: created
            });
        }

        return res.status(400).json({
            success: false,
            message:
                "Action tidak dikenali"
        });
    } catch (error) {
        console.error(
            "CHAT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error?.message ||
                "Terjadi kesalahan pada server"
        });
    }
}
