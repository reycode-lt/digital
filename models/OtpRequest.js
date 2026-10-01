import mongoose from "mongoose";

const OtpRequestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        phone: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        otpHash: {
            type: String,
            required: true
        },

        status: {
            type: String,
            enum: [
                "pending",
                "verified",
                "expired",
                "invalidated"
            ],
            default: "pending",
            index: true
        },

        attempts: {
            type: Number,
            default: 0
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        },

        requestedAt: {
            type: Date,
            default: Date.now,
            index: true
        },

        verifiedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

OtpRequestSchema.index({
    userId: 1,
    phone: 1,
    requestedAt: -1
});

export default mongoose.models.OtpRequest ||
    mongoose.model("OtpRequest", OtpRequestSchema);
