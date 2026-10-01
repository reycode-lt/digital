import mongoose from "mongoose";

const AlightMotionHistorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        action: {
            type: String,
            enum: ["manual", "auto"],
            required: true
        },

        username: {
            type: String,
            default: ""
        },

        email: {
            type: String,
            default: ""
        },

        animal: {
            type: String,
            default: ""
        },

        orderId: {
            type: String,
            default: ""
        },

        validUntil: {
            type: String,
            default: ""
        },

        weblogin: {
            type: String,
            default: ""
        },

        status: {
            type: String,
            enum: ["success", "failed"],
            required: true
        },

        error: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

export default mongoose.models.AlightMotionHistory ||
    mongoose.model(
        "AlightMotionHistory",
        AlightMotionHistorySchema
    );
