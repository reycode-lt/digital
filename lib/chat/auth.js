import User from "../../models/User.js";

export async function getChatUser(userId) {
    if (!userId) {
        return null;
    }

    const user = await User.findById(userId)
        .select(
            "_id name email avatarUrl emailVerified createdAt"
        )
        .lean();

    if (!user) {
        return null;
    }

    return {
        id: user._id.toString(),
        _id: user._id,
        name: user.name || "",
        email: user.email || "",
        avatarUrl: user.avatarUrl || "",
        emailVerified: user.emailVerified === true,
        createdAt: user.createdAt || null
    };
}
