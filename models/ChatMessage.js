import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema(
    {
        groupId: {
            type: String,
            required: true,
            index: true
        },

        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000
        },

        type: {
            type: String,
            enum: ["text"],
            default: "text"
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

ChatMessageSchema.index({
    groupId: 1,
    createdAt: -1
});

export default mongoose.models.ChatMessage ||
    mongoose.model("ChatMessage", ChatMessageSchema);
