import mongoose from "mongoose";

const GitHubAccountSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },

        githubId: {
            type: String,
            required: true
        },

        githubUsername: {
            type: String,
            required: true,
            trim: true
        },

        githubTokenEncrypted: {
            type: String,
            required: true
        },

        connected: {
            type: Boolean,
            default: true
        },

        connectedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

export default mongoose.models.GitHubAccount ||
    mongoose.model(
        "GitHubAccount",
        GitHubAccountSchema
    );