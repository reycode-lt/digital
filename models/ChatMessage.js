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
            required: true,
            trim: true,
            maxlength: 5000
        }
    },
    {
        timestamps: true
    }
);

export default mongoose.models.ChatMessage ||
    mongoose.model("ChatMessage", ChatMessageSchema);
