import crypto from "crypto";
import OtpRequest from "../../models/OtpRequest.js";

const OTP_LENGTH = 6;
const OTP_COOLDOWN = 5 * 60 * 1000;
const OTP_EXPIRES = 5 * 60 * 1000;
const OTP_DAILY_LIMIT = 2;
const OTP_MAX_ATTEMPTS = 5;

function generateOtp() {
    const max = 10 ** OTP_LENGTH;

    return crypto
        .randomInt(0, max)
        .toString()
        .padStart(OTP_LENGTH, "0");
}

function hashOtp(otp) {
    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
}

function normalizePhone(phone) {
    return String(phone || "")
        .replace(/[^\d+]/g, "")
        .replace(/^00/, "+")
        .trim();
}

async function invalidatePendingOtp(
    userId,
    phone
) {
    await OtpRequest.updateMany(
        {
            userId,
            phone,
            status: "pending"
        },
        {
            $set: {
                status: "invalidated"
            }
        }
    );
}

async function requestOtp({
    userId,
    phone
}) {
    phone = normalizePhone(phone);

    if (!phone) {
        throw new Error(
            "Nomor WhatsApp wajib diisi."
        );
    }

    const now = Date.now();

    const latest =
        await OtpRequest.findOne({
            userId,
            phone
        })
            .sort({
                requestedAt: -1
            })
            .lean();

    if (latest) {
        const elapsed =
            now -
            new Date(
                latest.requestedAt
            ).getTime();

        if (
            elapsed <
            OTP_COOLDOWN
        ) {
            const remaining =
                Math.ceil(
                    (OTP_COOLDOWN -
                        elapsed) /
                        1000
                );

            const minutes =
                Math.floor(
                    remaining / 60
                );

            const seconds =
                remaining % 60;

            throw new Error(
                `Tunggu ${minutes} menit ${seconds} detik sebelum meminta OTP lagi.`
            );
        }
    }

    const dailySince =
        new Date(
            now -
                24 *
                    60 *
                    60 *
                    1000
        );

    const dailyCount =
        await OtpRequest.countDocuments({
            userId,
            phone,
            requestedAt: {
                $gte: dailySince
            }
        });

    if (
        dailyCount >=
        OTP_DAILY_LIMIT
    ) {
        throw new Error(
            "Batas OTP tercapai. Maksimal 2 OTP dalam 24 jam."
        );
    }

    await invalidatePendingOtp(
        userId,
        phone
    );

    const otp =
        generateOtp();

    const otpHash =
        hashOtp(otp);

    const expiresAt =
        new Date(
            now + OTP_EXPIRES
        );

    const request =
        await OtpRequest.create({
            userId,
            phone,
            otpHash,
            status: "pending",
            attempts: 0,
            expiresAt,
            requestedAt:
                new Date(now)
        });

    return {
        requestId:
            request._id.toString(),

        phone,

        otp,

        expiresAt,

        event: "phone_otp"
    };
}

async function verifyOtp({
    userId,
    phone,
    otp
}) {
    phone = normalizePhone(phone);

    otp = String(
        otp || ""
    ).trim();

    if (!phone) {
        throw new Error(
            "Nomor WhatsApp wajib diisi."
        );
    }

    if (!/^\d{6}$/.test(otp)) {
        throw new Error(
            "OTP harus terdiri dari 6 angka."
        );
    }

    const request =
        await OtpRequest.findOne({
            userId,
            phone,
            status: "pending"
        }).sort({
            requestedAt: -1
        });

    if (!request) {
        throw new Error(
            "OTP tidak ditemukan atau sudah tidak berlaku."
        );
    }

    if (
        request.expiresAt.getTime() <=
        Date.now()
    ) {
        request.status =
            "expired";

        await request.save();

        throw new Error(
            "OTP sudah kedaluwarsa."
        );
    }

    if (
        request.attempts >=
        OTP_MAX_ATTEMPTS
    ) {
        request.status =
            "invalidated";

        await request.save();

        throw new Error(
            "Batas percobaan OTP tercapai."
        );
    }

    const incomingHash =
        hashOtp(otp);

    if (
        incomingHash !==
        request.otpHash
    ) {
        request.attempts += 1;

        await request.save();

        throw new Error(
            "OTP salah."
        );
    }

    request.status =
        "verified";

    request.verifiedAt =
        new Date();

    await request.save();

    return {
        success: true,
        requestId:
            request._id.toString(),
        phone,
        verifiedAt:
            request.verifiedAt
    };
}

export {
    requestOtp,
    verifyOtp,
    normalizePhone
};
