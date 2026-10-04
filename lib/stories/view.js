import mongoose from "mongoose";
import Story from "../../models/Story.js";
import StoryView from "../../models/StoryView.js";

export async function viewStory({
    storyId,
    userId
}) {
    if (
        !mongoose.Types.ObjectId.isValid(storyId)
    ) {
        throw new Error("Story tidak valid");
    }

    if (
        !mongoose.Types.ObjectId.isValid(userId)
    ) {
        throw new Error("User tidak valid");
    }

    const story = await Story.findOne({
        _id: storyId,
        expiresAt: {
            $gt: new Date()
        }
    });

    if (!story) {
        throw new Error(
            "Story tidak ditemukan atau sudah expired"
        );
    }

    const viewedAt = new Date();

    const view =
        await StoryView.findOneAndUpdate(
            {
                storyId,
                userId
            },
            {
                $set: {
                    viewedAt
                }
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            }
        );

    return view;
}

export async function getStoryViewers({
    storyId,
    ownerId
}) {
    if (
        !mongoose.Types.ObjectId.isValid(storyId)
    ) {
        throw new Error("Story tidak valid");
    }

    const story = await Story.findOne({
        _id: storyId,
        ownerId
    });

    if (!story) {
        throw new Error(
            "Story tidak ditemukan"
        );
    }

    const viewers =
        await StoryView.find({
            storyId
        })
            .populate(
                "userId",
                "name avatarUrl emailVerified"
            )
            .sort({
                viewedAt: -1
            })
            .lean();

    return viewers;
}
