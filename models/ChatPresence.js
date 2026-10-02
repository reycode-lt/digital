import mongoose from "mongoose";

const ChatPresenceSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },

        groupId: {
            type: String,
            required: true,
            index: true
        },

        lastSeenAt: {
            type: Date,
            required: true,
            index: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

export default mongoose.models.ChatPresence ||
    mongoose.model("ChatPresence", ChatPresenceSchema);
