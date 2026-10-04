import mongoose from "mongoose";

const StoryViewSchema = new mongoose.Schema(
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
        viewedAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

StoryViewSchema.index(
    {
        storyId: 1,
        userId: 1
    },
    {
        unique: true
    }
);

StoryViewSchema.index({
    storyId: 1,
    viewedAt: -1
});

export default mongoose.models.StoryView ||
    mongoose.model(
        "StoryView",
        StoryViewSchema
    );
