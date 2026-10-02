import ChatMessage from "../../models/ChatMessage.js";
import User from "../../models/User.js";
import { CHAT_GROUP_ID } from "./group.js";

function formatMessage(message) {
    const sender = message.senderId;

    return {
        id: message._id.toString(),
        _id: message._id,
        groupId: message.groupId,
        message: message.message,
        type: message.type,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        user: sender
            ? {
                  id: sender._id.toString(),
                  _id: sender._id,
                  name: sender.name || "",
                  email: sender.email || "",
                  avatarUrl:
                      sender.avatarUrl || "",
                  emailVerified:
                      sender.emailVerified === true
              }
            : null
    };
}

export async function getMessages({
    limit = 50,
    before = null
} = {}) {
    let safeLimit = Number(limit);

    if (!Number.isFinite(safeLimit)) {
        safeLimit = 50;
    }

    safeLimit = Math.max(
        1,
        Math.min(100, Math.floor(safeLimit))
    );

    const query = {
        groupId: CHAT_GROUP_ID
    };

    if (before) {
        const beforeDate = new Date(before);

        if (!Number.isNaN(beforeDate.getTime())) {
            query.createdAt = {
                $lt: beforeDate
            };
        }
    }

    const messages = await ChatMessage.find(query)
        .sort({
            createdAt: -1
        })
        .limit(safeLimit + 1)
        .populate({
            path: "senderId",
            model: User,
            select:
                "_id name email avatarUrl emailVerified"
        })
        .lean();

    const hasMore =
        messages.length > safeLimit;

    const result = messages
        .slice(0, safeLimit)
        .reverse()
        .map(formatMessage);

    return {
        messages: result,
        hasMore
    };
}

export async function sendMessage(
    userId,
    message
) {
    if (!userId) {
        throw new Error("User tidak valid");
    }

    if (
        typeof message !== "string"
    ) {
        throw new Error(
            "Pesan harus berupa teks"
        );
    }

    const cleanMessage = message.trim();

    if (!cleanMessage) {
        throw new Error(
            "Pesan tidak boleh kosong"
        );
    }

    if (cleanMessage.length > 2000) {
        throw new Error(
            "Pesan maksimal 2000 karakter"
        );
    }

    const user = await User.findById(userId)
        .select(
            "_id name email avatarUrl emailVerified"
        )
        .lean();

    if (!user) {
        throw new Error(
            "User tidak ditemukan"
        );
    }

    const created = await ChatMessage.create({
        groupId: CHAT_GROUP_ID,
        senderId: user._id,
        message: cleanMessage,
        type: "text"
    });

    return {
        id: created._id.toString(),
        _id: created._id,
        groupId: created.groupId,
        message: created.message,
        type: created.type,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        user: {
            id: user._id.toString(),
            _id: user._id,
            name: user.name || "",
            email: user.email || "",
            avatarUrl: user.avatarUrl || "",
            emailVerified:
                user.emailVerified === true
        }
    };
}
