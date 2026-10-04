import mongoose from "mongoose";
import { del } from "@vercel/blob";
import Story from "../../models/Story.js";
import StoryView from "../../models/StoryView.js";
import StoryComment from "../../models/StoryComment.js";

export async function deleteStory({
    storyId,
    userId
}) {
    if (
        !mongoose.Types.ObjectId.isValid(storyId)
    ) {
        throw new Error("Story tidak valid");
    }

    const story = await Story.findOne({
        _id: storyId,
        ownerId: userId
    });

    if (!story) {
        throw new Error(
            "Story tidak ditemukan"
        );
    }

    if (story.mediaUrl) {
        try {
            await del(story.mediaUrl);
        } catch {}
    }

    await Promise.all([
        StoryView.deleteMany({
            storyId: story._id
        }),
        StoryComment.deleteMany({
            storyId: story._id
        }),
        Story.deleteOne({
            _id: story._id
        })
    ]);

    return {
        success: true,
        storyId: story._id
    };
}
