import mongoose from "mongoose";

let cached = globalThis.__reycode_mongoose;

if (!cached) {
    cached = globalThis.__reycode_mongoose = {
        conn: null,
        promise: null
    };
}

export async function connectDB() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI belum diatur");
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(
            process.env.MONGODB_URI,
            {
                bufferCommands: false,
                maxPoolSize: 10
            }
        );
    }

    cached.conn = await cached.promise;

    return cached.conn;
}