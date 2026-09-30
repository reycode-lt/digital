import mongoose from "mongoose";

const DeploymentSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        slug: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },

        domain: {
            type: String,
            required: true,
            enum: [
                "reycode.my.id",
                "reycode.web.id",
                "web-api.my.id"
            ]
        },

        vercelProjectId: {
            type: String,
            default: ""
        },

        vercelUrl: {
            type: String,
            default: ""
        },

        customUrl: {
            type: String,
            default: ""
        },

        sourceType: {
            type: String,
            enum: ["repo", "zip"],
            required: true
        },

        repositoryUrl: {
            type: String,
            default: ""
        },

        zipFileName: {
            type: String,
            default: ""
        },

        preset: {
            type: String,
            default: "Auto Detect"
        },

        status: {
            type: String,
            enum: [
                "deploying",
                "live",
                "failed",
                "deleted"
            ],
            default: "deploying"
        },

        lastDeploymentId: {
            type: String,
            default: ""
        },

        errorMessage: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

DeploymentSchema.index({
    userId: 1,
    createdAt: -1
});

DeploymentSchema.index(
    {
        userId: 1,
        slug: 1
    },
    {
        unique: true
    }
);

export default mongoose.models.Deployment ||
    mongoose.model("Deployment", DeploymentSchema);