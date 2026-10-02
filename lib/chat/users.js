import User from "../../models/User.js";
import ChatPresence from "../../models/ChatPresence.js";
import { CHAT_GROUP_ID } from "./group.js";

const ONLINE_WINDOW = 60000;

export async function getChatUsers() {
    const onlineSince = new Date(
        Date.now() - ONLINE_WINDOW
    );

    const [users, presence] = await Promise.all([
        User.find({})
            .select(
                "_id name email avatarUrl emailVerified createdAt"
            )
            .sort({
                name: 1
            })
            .lean(),

        ChatPresence.find({
            groupId: CHAT_GROUP_ID,
            lastSeenAt: {
                $gte: onlineSince
            }
        })
            .select("userId")
            .lean()
    ]);

    const onlineIds = new Set(
        presence.map(item =>
            item.userId.toString()
        )
    );

    return users.map(user => ({
        id: user._id.toString(),
        _id: user._id,
        name: user.name || "",
        email: user.email || "",
        avatarUrl: user.avatarUrl || "",
        emailVerified:
            user.emailVerified === true,
        online: onlineIds.has(
            user._id.toString()
        ),
        createdAt: user.createdAt || null
    }));
}
