import User from "../../models/User.js";
import ChatPresence from "../../models/ChatPresence.js";

export const CHAT_GROUP_ID =
    "monikalabs-comunity";

export const CHAT_GROUP_NAME =
    "MonikaLabs Comunity";

export const CHAT_GROUP_AVATAR =
    "https://k.top4top.io/p_392741enr1.png";

const ONLINE_WINDOW = 60000;

export async function getGroupInfo() {
    const onlineSince = new Date(
        Date.now() - ONLINE_WINDOW
    );

    const [totalUsers, onlineUsers] =
        await Promise.all([
            User.countDocuments({}),

            ChatPresence.countDocuments({
                groupId: CHAT_GROUP_ID,
                lastSeenAt: {
                    $gte: onlineSince
                }
            })
        ]);

    return {
        id: CHAT_GROUP_ID,
        name: CHAT_GROUP_NAME,
        avatarUrl: CHAT_GROUP_AVATAR,
        totalUsers,
        onlineUsers
    };
}
