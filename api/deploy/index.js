import axios from "axios";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import formidable from "formidable";

import { connectDB } from "../_lib/mongodb.js";
import Deployment from "../../models/Deployment.js";
import { getAuthToken, verifyToken } from "../_lib/auth.js";

export const config = {
    api: {
        bodyParser: false
    }
};

const VERCEL_API = "https://api.vercel.com";

const ALLOWED_DOMAINS = [
    "reycode.my.id",
    "reycode.web.id",
    "web-api.my.id"
];

const MAX_UPLOAD_SIZE = 45 * 1024 * 1024;
const MAX_TOTAL_ZIP_SIZE = 150 * 1024 * 1024;
const MAX_FILES = 1000;

function send(res, status, data) {
    return res.status(status).json(data);
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "project";
}

function headers() {
    if (!process.env.API_VERCEL) {
        throw new Error("API_VERCEL belum diatur");
    }

    return {
        Authorization: `Bearer ${process.env.API_VERCEL}`,
        "Content-Type": "application/json"
    };
}

async function vercel(method, endpoint, data) {
    const config = {
        method,
        url: `${VERCEL_API}${endpoint}`,
        headers: headers(),
        timeout: 60000,
        validateStatus: () => true
    };

    if (data !== undefined) {
        config.data = data;
    }

    const result = await axios(config);

    if (result.status < 200 || result.status >= 300) {
        const message =
            result.data?.error?.message ||
            result.data?.message ||
            `Vercel API error ${result.status}`;

        const error = new Error(message);

        error.status = result.status;
        error.data = result.data;

        throw error;
    }

    return result.data;
}

async function authenticate(req, res) {
    const token = getAuthToken(req);

    if (!token) {
        send(res, 401, {
            success: false,
            message: "Belum login"
        });

        return null;
    }

    const payload = await verifyToken(token);

    if (!payload?.userId) {
        send(res, 401, {
            success: false,
            message: "Session tidak valid"
        });

        return null;
    }

    return payload;
}

function parseForm(req) {
    const form = formidable({
        multiples: false,
        maxFileSize: MAX_UPLOAD_SIZE,
        keepExtensions: true,
        allowEmptyFiles: false
    });

    return new Promise((resolve, reject) => {
        form.parse(req, (error, fields, files) => {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                fields,
                files
            });
        });
    });
}

function field(fields, name, fallback = "") {
    const value = fields?.[name];

    if (Array.isArray(value)) {
        return String(value[0] ?? fallback);
    }

    return String(value ?? fallback);
}

function getUploadedFile(files) {
    const possible = [
        files?.file,
        files?.zip,
        files?.uploadFile,
        files?.updateFile
    ];

    for (const item of possible) {
        if (!item) continue;

        if (Array.isArray(item)) {
            if (item[0]) {
                return item[0];
            }
        } else {
            return item;
        }
    }

    return null;
}

function normalizeRepo(url) {
    const value = String(url || "").trim();

    if (!value) {
        throw new Error(
            "Repository URL wajib diisi"
        );
    }

    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error(
            "Repository URL tidak valid"
        );
    }

    if (
        parsed.protocol !== "https:" ||
        ![
            "github.com",
            "www.github.com",
            "gitlab.com",
            "www.gitlab.com",
            "bitbucket.org",
            "www.bitbucket.org"
        ].includes(
            parsed.hostname.toLowerCase()
        )
    ) {
        throw new Error(
            "Repository hanya mendukung GitHub, GitLab, atau Bitbucket"
        );
    }

    return value
        .replace(/\/+$/, "")
        .replace(/\.git$/, "");
}

function parseGitHubRepo(url) {
    const parsed = new URL(url);

    const parts = parsed.pathname
        .replace(/^\/+|\/+$/g, "")
        .split("/");

    if (parts.length < 2) {
        throw new Error(
            "Repository GitHub tidak valid"
        );
    }

    return {
        owner: parts[0],
        repo: parts[1]
    };
}

async function getGitHubRepo(owner, repo) {
    const result = await axios({
        method: "GET",
        url:
            `https://api.github.com/repos/` +
            `${encodeURIComponent(owner)}/` +
            `${encodeURIComponent(repo)}`,
        headers: {
            Accept:
                "application/vnd.github+json",
            "User-Agent":
                "ReyCode-Deploy"
        },
        timeout: 20000,
        validateStatus: () => true
    });

    if (result.status !== 200) {
        throw new Error(
            "Repository GitHub tidak ditemukan atau tidak dapat diakses"
        );
    }

    return result.data;
}

async function getProject(slug) {
    try {
        return await vercel(
            "GET",
            `/v9/projects/${encodeURIComponent(slug)}`
        );
    } catch {
        return null;
    }
}

async function createProject(slug) {
    return await vercel(
        "POST",
        "/v10/projects",
        {
            name: slug
        }
    );
}

async function getOrCreateProject(slug) {
    const existing =
        await getProject(slug);

    if (existing) {
        return existing;
    }

    return await createProject(slug);
}

async function uploadVercelFile(buffer) {
    const sha = crypto
        .createHash("sha1")
        .update(buffer)
        .digest("hex");

    const result = await axios({
        method: "POST",
        url: `${VERCEL_API}/v2/files`,
        headers: {
            Authorization:
                `Bearer ${process.env.API_VERCEL}`,
            "Content-Type":
                "application/octet-stream",
            "x-now-digest": sha
        },
        data: buffer,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000,
        validateStatus: () => true
    });

    if (
        result.status !== 200 &&
        result.status !== 201 &&
        result.status !== 202 &&
        result.status !== 409
    ) {
        throw new Error(
            result.data?.error?.message ||
            "Gagal upload file ke Vercel"
        );
    }

    return {
        sha,
        size: buffer.length
    };
}

function normalizeZipPath(filename) {
    let value = String(filename || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/g, "")
        .replace(/^(\.\/)+/g, "");

    value = path.posix
        .normalize(value)
        .replace(/^(\.\.\/)+/g, "");

    value = value.replace(/^\/+/g, "");

    if (!value || value === ".") {
        return null;
    }

    if (
        value.startsWith("../") ||
        value.includes("/../") ||
        path.posix.isAbsolute(value)
    ) {
        return null;
    }

    return value;
}

function findIndexFile(files) {
    const matches = files.filter(
        item =>
            item.file.toLowerCase() ===
            "index.html"
    );

    if (!matches.length) {
        return null;
    }

    matches.sort((a, b) => {
        const depthA =
            a.file.split("/").length;

        const depthB =
            b.file.split("/").length;

        return depthA - depthB;
    });

    return matches[0];
}

function stripIndexRoot(files, indexFile) {
    const indexParts =
        indexFile.file.split("/");

    if (indexParts.length <= 1) {
        return files;
    }

    const root =
        indexParts
            .slice(0, -1)
            .join("/") + "/";

    return files
        .map(item => {
            if (
                item.file ===
                indexFile.file
            ) {
                return {
                    ...item,
                    file: "index.html"
                };
            }

            if (
                item.file.startsWith(root)
            ) {
                return {
                    ...item,
                    file: item.file.slice(
                        root.length
                    )
                };
            }

            return null;
        })
        .filter(
            item =>
                item &&
                item.file
        );
}

function readZip(zipPath) {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    if (entries.length > MAX_FILES) {
        throw new Error(
            "ZIP berisi terlalu banyak file"
        );
    }

    const files = [];

    let totalSize = 0;

    for (const entry of entries) {
        if (entry.isDirectory) {
            continue;
        }

        const filename =
            normalizeZipPath(
                entry.entryName
            );

        if (!filename) {
            continue;
        }

        const buffer =
            entry.getData();

        totalSize += buffer.length;

        if (
            totalSize >
            MAX_TOTAL_ZIP_SIZE
        ) {
            throw new Error(
                "Total isi ZIP terlalu besar"
            );
        }

        files.push({
            file: filename,
            buffer
        });
    }

    if (!files.length) {
        throw new Error(
            "ZIP tidak berisi file yang dapat dideploy"
        );
    }

    const indexFile =
        findIndexFile(files);

    if (!indexFile) {
        throw new Error(
            "index.html tidak ditemukan di dalam ZIP"
        );
    }

    return stripIndexRoot(
        files,
        indexFile
    );
}

async function prepareUploadedFiles(
    uploadedFile
) {
    if (!uploadedFile?.filepath) {
        throw new Error(
            "File upload tidak ditemukan"
        );
    }

    const filename =
        String(
            uploadedFile.originalFilename ||
            ""
        ).toLowerCase();

    const mimetype =
        String(
            uploadedFile.mimetype ||
            ""
        ).toLowerCase();

    const isZip =
        filename.endsWith(".zip") ||
        mimetype.includes("zip") ||
        mimetype.includes(
            "compressed"
        );

    if (isZip) {
        return readZip(
            uploadedFile.filepath
        );
    }

    const buffer =
        await fs.readFile(
            uploadedFile.filepath
        );

    const isHtml =
        filename.endsWith(".html") ||
        filename.endsWith(".htm") ||
        mimetype.includes("html") ||
        buffer
            .subarray(0, 1000)
            .toString("utf8")
            .toLowerCase()
            .includes("<html");

    if (!isHtml) {
        throw new Error(
            "File tunggal hanya mendukung index.html"
        );
    }

    return [
        {
            file: "index.html",
            buffer
        }
    ];
}

async function uploadProjectFiles(
    uploadedFile
) {
    const files =
        await prepareUploadedFiles(
            uploadedFile
        );

    if (!files.length) {
        throw new Error(
            "Tidak ada file yang dapat dideploy"
        );
    }

    if (files.length > MAX_FILES) {
        throw new Error(
            "Project berisi terlalu banyak file"
        );
    }

    const indexFile =
        findIndexFile(files);

    if (!indexFile) {
        throw new Error(
            "index.html tidak ditemukan"
        );
    }

    const uploaded = [];

    for (const item of files) {
        const result =
            await uploadVercelFile(
                item.buffer
            );

        uploaded.push({
            file: item.file,
            sha: result.sha,
            size: result.size
        });
    }

    return uploaded;
}

async function deployFiles(
    project,
    files
) {
    return await vercel(
        "POST",
        "/v13/deployments",
        {
            name: project.name,
            project: project.id,
            target: "production",
            files
        }
    );
}

async function deployGitHub(
    project,
    repositoryUrl
) {
    const repoUrl =
        normalizeRepo(
            repositoryUrl
        );

    const parsed =
        new URL(repoUrl);

    if (
        parsed.hostname !==
            "github.com" &&
        parsed.hostname !==
            "www.github.com"
    ) {
        throw new Error(
            "Untuk deployment repository saat ini gunakan repository GitHub"
        );
    }

    const {
        owner,
        repo
    } =
        parseGitHubRepo(
            repoUrl
        );

    const githubRepo =
        await getGitHubRepo(
            owner,
            repo
        );

    const branch =
        githubRepo.default_branch ||
        "main";

    return await vercel(
        "POST",
        "/v13/deployments",
        {
            name: project.name,
            project: project.id,
            target: "production",
            gitSource: {
                type: "github",
                repoId:
                    githubRepo.id,
                ref: branch
            }
        }
    );
}

async function addDomain(
    projectId,
    domain
) {
    try {
        return await vercel(
            "POST",
            `/v10/projects/${encodeURIComponent(
                projectId
            )}/domains`,
            {
                name: domain
            }
        );
    } catch (error) {
        if (
            error.status === 400 ||
            error.status === 409
        ) {
            try {
                return await vercel(
                    "GET",
                    `/v9/projects/${encodeURIComponent(
                        projectId
                    )}/domains/${encodeURIComponent(
                        domain
                    )}`
                );
            } catch {
                return null;
            }
        }

        throw error;
    }
}

async function getDeployment(id) {
    return await vercel(
        "GET",
        `/v13/deployments/${encodeURIComponent(
            id
        )}`
    );
}

async function syncDeploymentStatus(
    deployment
) {
    if (
        !deployment.lastDeploymentId ||
        deployment.status === "deleted"
    ) {
        return deployment;
    }

    try {
        const remote =
            await getDeployment(
                deployment.lastDeploymentId
            );

        if (
            remote.readyState ===
            "READY"
        ) {
            deployment.status =
                "live";

            deployment.errorMessage =
                "";

            if (remote.url) {
                deployment.vercelUrl =
                    `https://${remote.url}`;
            }

            await deployment.save();
        }

        if (
            remote.readyState ===
                "ERROR" ||
            remote.readyState ===
                "CANCELED"
        ) {
            deployment.status =
                "failed";

            deployment.errorMessage =
                remote.error?.message ||
                remote.error?.code ||
                `Deployment ${String(
                    remote.readyState
                ).toLowerCase()}`;

            await deployment.save();
        }
    } catch (error) {
        console.error(
            "STATUS SYNC ERROR:",
            error.message
        );
    }

    return deployment;
}

async function createDeployment(
    req,
    res,
    userId
) {
    const contentType =
        req.headers[
            "content-type"
        ] || "";

    let name = "";
    let domain = "";
    let sourceType = "";
    let repositoryUrl = "";
    let preset = "Auto Detect";
    let uploadedFile = null;

    if (
        contentType.includes(
            "multipart/form-data"
        )
    ) {
        const parsed =
            await parseForm(req);

        name =
            field(
                parsed.fields,
                "name"
            );

        domain =
            field(
                parsed.fields,
                "domain"
            );

        sourceType =
            field(
                parsed.fields,
                "sourceType"
            );

        repositoryUrl =
            field(
                parsed.fields,
                "repositoryUrl"
            );

        preset =
            field(
                parsed.fields,
                "preset",
                "Auto Detect"
            );

        uploadedFile =
            getUploadedFile(
                parsed.files
            );
    } else {
        let body =
            req.body || {};

        if (
            typeof body ===
            "string"
        ) {
            try {
                body =
                    JSON.parse(
                        body
                    );
            } catch {
                body = {};
            }
        }

        name =
            String(
                body.name || ""
            );

        domain =
            String(
                body.domain || ""
            );

        sourceType =
            String(
                body.sourceType ||
                ""
            );

        repositoryUrl =
            String(
                body.repositoryUrl ||
                ""
            );

        preset =
            String(
                body.preset ||
                "Auto Detect"
            );
    }

    name =
        name.trim();

    domain =
        domain.trim();

    sourceType =
        sourceType.trim();

    if (!name) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Project name wajib diisi"
            }
        );
    }

    if (
        !ALLOWED_DOMAINS.includes(
            domain
        )
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Domain tidak valid"
            }
        );
    }

    if (
        sourceType !== "repo" &&
        sourceType !== "zip" &&
        sourceType !== "file"
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Source deployment tidak valid"
            }
        );
    }

    if (
        sourceType === "repo" &&
        !repositoryUrl
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Repository URL wajib diisi"
            }
        );
    }

    if (
        (
            sourceType ===
                "zip" ||
            sourceType ===
                "file"
        ) &&
        !uploadedFile
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "File project wajib diupload"
            }
        );
    }

    const slug =
        slugify(name);

    const existing =
        await Deployment.findOne({
            userId,
            slug,
            status: {
                $ne: "deleted"
            }
        });

    if (existing) {
        return send(
            res,
            409,
            {
                success: false,
                message:
                    "Nama project sudah digunakan"
            }
        );
    }

    let normalizedRepo =
        "";

    if (
        sourceType ===
        "repo"
    ) {
        normalizedRepo =
            normalizeRepo(
                repositoryUrl
            );
    }

    const project =
        await getOrCreateProject(
            slug
        );

    let result;
    let uploadFileName = "";

    if (
        sourceType ===
        "repo"
    ) {
        result =
            await deployGitHub(
                project,
                normalizedRepo
            );
    } else {
        uploadFileName =
            uploadedFile.originalFilename ||
            "index.html";

        const files =
            await uploadProjectFiles(
                uploadedFile
            );

        result =
            await deployFiles(
                project,
                files
            );
    }

    const customUrl =
        `https://${slug}.${domain}`;

    let domainConfigured =
        false;

    try {
        await addDomain(
            project.id,
            customUrl
        );

        domainConfigured =
            true;
    } catch (error) {
        console.error(
            "DOMAIN ERROR:",
            error.message
        );
    }

    const deployment =
        await Deployment.create({
            userId,
            name,
            slug,
            domain,
            vercelProjectId:
                project.id || "",
            vercelUrl:
                result.url
                    ? `https://${result.url}`
                    : "",
            customUrl,
            sourceType:
                sourceType ===
                "file"
                    ? "zip"
                    : sourceType,
            repositoryUrl:
                sourceType ===
                "repo"
                    ? normalizedRepo
                    : "",
            zipFileName:
                sourceType ===
                    "zip" ||
                sourceType ===
                    "file"
                    ? uploadFileName
                    : "",
            preset:
                preset ||
                "Auto Detect",
            status:
                "deploying",
            lastDeploymentId:
                result.id || "",
            errorMessage:
                ""
        });

    if (
        (
            sourceType ===
                "zip" ||
            sourceType ===
                "file"
        ) &&
        uploadedFile?.filepath
    ) {
        try {
            await fs.unlink(
                uploadedFile.filepath
            );
        } catch {}
    }

    return send(
        res,
        201,
        {
            success: true,
            message:
                "Deployment berhasil dikirim ke Vercel",
            deployment,
            domainConfigured
        }
    );
}

async function updateDeployment(
    req,
    res,
    userId
) {
    const contentType =
        req.headers[
            "content-type"
        ] || "";

    let id = "";
    let sourceType = "";
    let repositoryUrl = "";
    let uploadedFile = null;

    if (
        contentType.includes(
            "multipart/form-data"
        )
    ) {
        const parsed =
            await parseForm(req);

        id =
            field(
                parsed.fields,
                "id"
            );

        sourceType =
            field(
                parsed.fields,
                "sourceType"
            );

        repositoryUrl =
            field(
                parsed.fields,
                "repositoryUrl"
            );

        uploadedFile =
            getUploadedFile(
                parsed.files
            );
    } else {
        let body =
            req.body || {};

        if (
            typeof body ===
            "string"
        ) {
            try {
                body =
                    JSON.parse(
                        body
                    );
            } catch {
                body = {};
            }
        }

        id =
            String(
                body.id || ""
            );

        sourceType =
            String(
                body.sourceType ||
                ""
            );

        repositoryUrl =
            String(
                body.repositoryUrl ||
                ""
            );
    }

    if (!id) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Deployment ID wajib diisi"
            }
        );
    }

    if (
        sourceType !== "repo" &&
        sourceType !== "zip" &&
        sourceType !== "file"
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Source deployment tidak valid"
            }
        );
    }

    if (
        sourceType ===
            "repo" &&
        !repositoryUrl
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Repository URL wajib diisi"
            }
        );
    }

    if (
        (
            sourceType ===
                "zip" ||
            sourceType ===
                "file"
        ) &&
        !uploadedFile
    ) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "File project wajib diupload"
            }
        );
    }

    const deployment =
        await Deployment.findOne({
            _id: id,
            userId,
            status: {
                $ne: "deleted"
            }
        });

    if (!deployment) {
        return send(
            res,
            404,
            {
                success: false,
                message:
                    "Deployment tidak ditemukan"
            }
        );
    }

    const project =
        await getOrCreateProject(
            deployment.slug
        );

    let result;
    let normalizedRepo =
        "";

    if (
        sourceType ===
        "repo"
    ) {
        normalizedRepo =
            normalizeRepo(
                repositoryUrl
            );

        result =
            await deployGitHub(
                project,
                normalizedRepo
            );
    } else {
        const files =
            await uploadProjectFiles(
                uploadedFile
            );

        result =
            await deployFiles(
                project,
                files
            );
    }

    deployment.sourceType =
        sourceType ===
            "file"
            ? "zip"
            : sourceType;

    deployment.repositoryUrl =
        sourceType ===
            "repo"
            ? normalizedRepo
            : "";

    deployment.zipFileName =
        (
            sourceType ===
                "zip" ||
            sourceType ===
                "file"
        )
            ? uploadedFile.originalFilename ||
              "index.html"
            : "";

    deployment.vercelProjectId =
        project.id || "";

    deployment.lastDeploymentId =
        result.id || "";

    deployment.status =
        "deploying";

    deployment.errorMessage =
        "";

    if (result.url) {
        deployment.vercelUrl =
            `https://${result.url}`;
    }

    await deployment.save();

    if (
        (
            sourceType ===
                "zip" ||
            sourceType ===
                "file"
        ) &&
        uploadedFile?.filepath
    ) {
        try {
            await fs.unlink(
                uploadedFile.filepath
            );
        } catch {}
    }

    return send(
        res,
        200,
        {
            success: true,
            message:
                "Redeploy berhasil dikirim",
            deployment
        }
    );
}

async function deleteDeployment(
    req,
    res,
    userId
) {
    let body =
        req.body || {};

    if (
        typeof body ===
        "string"
    ) {
        try {
            body =
                JSON.parse(
                    body
                );
        } catch {
            body = {};
        }
    }

    const id =
        body.id;

    if (!id) {
        return send(
            res,
            400,
            {
                success: false,
                message:
                    "Deployment ID wajib diisi"
            }
        );
    }

    const deployment =
        await Deployment.findOne({
            _id: id,
            userId,
            status: {
                $ne: "deleted"
            }
        });

    if (!deployment) {
        return send(
            res,
            404,
            {
                success: false,
                message:
                    "Deployment tidak ditemukan"
            }
        );
    }

    if (
        deployment.vercelProjectId
    ) {
        try {
            await vercel(
                "DELETE",
                `/v9/projects/${encodeURIComponent(
                    deployment.vercelProjectId
                )}`
            );
        } catch (error) {
            console.error(
                "VERCEL DELETE ERROR:",
                error.message
            );
        }
    }

    deployment.status =
        "deleted";

    await deployment.save();

    return send(
        res,
        200,
        {
            success: true,
            message:
                "Deployment berhasil dihapus"
        }
    );
}

async function listDeployments(
    res,
    userId
) {
    const deployments =
        await Deployment.find({
            userId,
            status: {
                $ne: "deleted"
            }
        }).sort({
            updatedAt: -1
        });

    for (
        const deployment
        of deployments
    ) {
        if (
            deployment.status ===
            "deploying"
        ) {
            await syncDeploymentStatus(
                deployment
            );
        }
    }

    const result =
        deployments.map(
            item =>
                item.toObject()
        );

    return send(
        res,
        200,
        {
            success: true,
            deployments:
                result
        }
    );
}

export default async function handler(
    req,
    res
) {
    try {
        const user =
            await authenticate(
                req,
                res
            );

        if (!user) {
            return;
        }

        await connectDB();

        if (
            req.method ===
            "GET"
        ) {
            return await listDeployments(
                res,
                user.userId
            );
        }

        if (
            req.method ===
            "POST"
        ) {
            return await createDeployment(
                req,
                res,
                user.userId
            );
        }

        if (
            req.method ===
            "PATCH"
        ) {
            return await updateDeployment(
                req,
                res,
                user.userId
            );
        }

        if (
            req.method ===
            "DELETE"
        ) {
            return await deleteDeployment(
                req,
                res,
                user.userId
            );
        }

        return send(
            res,
            405,
            {
                success: false,
                message:
                    "Method tidak diizinkan"
            }
        );

    } catch (error) {

        console.error(
            "DEPLOY API ERROR:",
            error
        );

        if (
            error?.code ===
                "LIMIT_FILE_SIZE" ||
            error?.httpCode ===
                413
        ) {
            return send(
                res,
                413,
                {
                    success: false,
                    message:
                        "Ukuran file terlalu besar. Maksimal 45 MB"
                }
            );
        }

        if (
            error?.code ===
            11000
        ) {
            return send(
                res,
                409,
                {
                    success: false,
                    message:
                        "Project dengan nama tersebut sudah ada"
                }
            );
        }

        return send(
            res,
            500,
            {
                success: false,
                message:
                    error?.message ||
                    "Deployment gagal"
            }
        );
    }
            }
