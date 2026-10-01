import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 30
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        whatsapp: {
            type: String,
            default: "",
            trim: true
        },

        phoneVerified: {
            type: Boolean,
            default: false
        },

        phoneVerifiedAt: {
            type: Date,
            default: null
        },

        emailVerified: {
            type: Boolean,
            default: false
        },

        welcomeEmailSent: {
            type: Boolean,
            default: false
        },

        verificationToken: {
            type: String,
            default: null
        },

        resetToken: {
            type: String,
            default: null
        },

        resetTokenExpires: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

export default mongoose.models.User ||
    mongoose.model("User", UserSchema);
