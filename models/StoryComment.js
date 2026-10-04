import mongoose from "mongoose";

const StoryCommentSchema = new mongoose.Schema(
    {
        storyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Story",
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StoryComment",
            default: null,
            index: true
        },
        text: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

StoryCommentSchema.index({
    storyId: 1,
    createdAt: -1
});

StoryCommentSchema.index({
    parentId: 1,
    createdAt: 1
});

export default mongoose.models.StoryComment ||
    mongoose.model(
        "StoryComment",
        StoryCommentSchema
    );
