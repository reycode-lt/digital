import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema(
    {
        group: {
            type: String,
            required: true,
            default: "monikalabs-comunity",
            index: true
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        content: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: ""
        },
        imageUrl: {
            type: String,
            trim: true,
            default: ""
        },
        imageName: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

ChatMessageSchema.index({
    group: 1,
    createdAt: -1
});

export default mongoose.models.ChatMessage ||
    mongoose.model("ChatMessage", ChatMessageSchema);
