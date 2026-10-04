import mongoose from "mongoose";

const StorySchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        mediaUrl: {
            type: String,
            required: true
        },
        mediaPathname: {
            type: String,
            default: ""
        },
        mediaType: {
            type: String,
            enum: ["image", "video"],
            required: true
        },
        contentType: {
            type: String,
            required: true
        },
        caption: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1000
        },
        expiresAt: {
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

StorySchema.index({
    ownerId: 1,
    createdAt: -1
});

StorySchema.index({
    expiresAt: 1
});

export default mongoose.models.Story ||
    mongoose.model("Story", StorySchema);
