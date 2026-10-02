import ChatPresence from "../../models/ChatPresence.js";
import { CHAT_GROUP_ID } from "./group.js";

export async function updatePresence(userId) {
    if (!userId) {
        return null;
    }

    const now = new Date();

    const presence = await ChatPresence.findOneAndUpdate(
        {
            userId
        },
        {
            userId,
            groupId: CHAT_GROUP_ID,
            lastSeenAt: now
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    ).lean();

    return {
        userId: presence.userId.toString(),
        groupId: presence.groupId,
        lastSeenAt: presence.lastSeenAt
    };
}
