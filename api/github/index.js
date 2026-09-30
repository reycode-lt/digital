import axios from "axios";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import AdmZip from "adm-zip";
import formidable from "formidable";

import { connectDB } from "../_lib/mongodb.js";
import { getAuthToken, verifyToken } from "../_lib/auth.js";
import { encryptToken, decryptToken } from "../_lib/github.js";
import GitHubAccount from "../../models/GitHubAccount.js";

export const config = {
    api: {
        bodyParser: false
    }
};

const GITHUB_API = "https://api.github.com";
const MAX_ZIP_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 1000;

function githubHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };
}

async function getSession(req) {
    const authToken = getAuthToken(req);

    if (!authToken) {
        return null;
    }

    const session = await verifyToken(authToken);

    if (!session?.userId) {
        return null;
    }

    return session;
}

async function getAccount(userId) {
    await connectDB();

    return await GitHubAccount.findOne({
        userId,
        connected: true
    }).lean();
}

async function getGitHubToken(userId) {
    const account = await getAccount(userId);

    if (!account) {
        throw new Error("GitHub belum terhubung");
    }

    return {
        account,
        token: decryptToken(account.githubTokenEncrypted)
    };
}

function cleanRepoName(name) {
    return String(name || "")
        .trim()
        .replace(/\.git$/i, "")
        .replace(/[^\w.-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^\.+/, "")
        .slice(0, 100);
}

function normalizePath(filePath) {
    let value = String(filePath || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");

    const parts = value
        .split("/")
        .filter(Boolean);

    if (!parts.length) {
        return "";
    }

    if (
        parts.some(
            part =>
                part === "." ||
                part === ".." ||
                part.includes("\0")
        )
    ) {
        return "";
    }

    return parts.join("/");
}

function isSafeFile(filePath) {
    const normalized = normalizePath(filePath);

    if (!normalized) {
        return false;
    }

    if (normalized.length > 500) {
        return false;
    }

    return true;
}

async function githubRequest(config) {
    return await axios({
        ...config,
        timeout: 30000
    });
}

async function getRepo(token, owner, repo) {
    const response = await githubRequest({
        method: "GET",
        url: `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        headers: githubHeaders(token)
    });

    return response.data;
}

async function connectGitHub(req, res, session) {
    const { token } = req.body || {};

    if (!token || typeof token !== "string") {
        return res.status(400).json({
            success: false,
            message: "GitHub token wajib diisi"
        });
    }

    const githubToken = token.trim();

    if (githubToken.length < 20) {
        return res.status(400).json({
            success: false,
            message: "GitHub token tidak valid"
        });
    }

    try {
        const response = await githubRequest({
            method: "GET",
            url: `${GITHUB_API}/user`,
            headers: githubHeaders(githubToken)
        });

        const user = response.data;

        if (!user?.id || !user?.login) {
            return res.status(400).json({
                success: false,
                message: "Data akun GitHub tidak valid"
            });
        }

        await connectDB();

        await GitHubAccount.findOneAndUpdate(
            {
                userId: session.userId
            },
            {
                userId: session.userId,
                githubId: String(user.id),
                githubUsername: user.login,
                githubTokenEncrypted: encryptToken(githubToken),
                connected: true,
                connectedAt: new Date()
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        return res.status(200).json({
            success: true,
            message: "GitHub berhasil terhubung",
            github: {
                id: String(user.id),
                username: user.login,
                name: user.name || "",
                avatar: user.avatar_url || ""
            }
        });
    } catch (error) {
        if (error.response?.status === 401) {
            return res.status(401).json({
                success: false,
                message: "GitHub token tidak valid"
            });
        }

        throw error;
    }
}

async function disconnectGitHub(req, res, session) {
    await connectDB();

    await GitHubAccount.findOneAndUpdate(
        {
            userId: session.userId
        },
        {
            connected: false
        }
    );

    return res.status(200).json({
        success: true,
        message: "GitHub berhasil diputus"
    });
}

async function getMe(req, res, session) {
    const account = await getAccount(session.userId);

    if (!account) {
        return res.status(200).json({
            success: true,
            connected: false,
            github: null
        });
    }

    return res.status(200).json({
        success: true,
        connected: true,
        github: {
            id: account.githubId,
            username: account.githubUsername,
            connectedAt: account.connectedAt
        }
    });
}

async function getRepos(req, res, session) {
    const { token, account } = await getGitHubToken(
        session.userId
    );

    const response = await githubRequest({
        method: "GET",
        url: `${GITHUB_API}/user/repos`,
        params: {
            affiliation: "owner,collaborator,organization_member",
            sort: "updated",
            direction: "desc",
            per_page: 100
        },
        headers: githubHeaders(token)
    });

    const repositories = response.data.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || "",
        private: repo.private,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        owner: repo.owner?.login || ""
    }));

    return res.status(200).json({
        success: true,
        github: {
            username: account.githubUsername
        },
        repositories
    });
}

async function createRepo(req, res, session) {
    const { token } = await getGitHubToken(
        session.userId
    );

    const {
        name,
        description = "",
        private: isPrivate = false,
        autoInit = true
    } = req.body || {};

    const repoName = cleanRepoName(name);

    if (!repoName) {
        return res.status(400).json({
            success: false,
            message: "Nama repository wajib diisi"
        });
    }

    const response = await githubRequest({
        method: "POST",
        url: `${GITHUB_API}/user/repos`,
        headers: githubHeaders(token),
        data: {
            name: repoName,
            description: String(description || "").slice(
                0,
                350
            ),
            private: Boolean(isPrivate),
            auto_init: Boolean(autoInit)
        }
    });

    return res.status(201).json({
        success: true,
        message: "Repository berhasil dibuat",
        repository: {
            id: response.data.id,
            name: response.data.name,
            fullName: response.data.full_name,
            private: response.data.private,
            htmlUrl: response.data.html_url,
            defaultBranch: response.data.default_branch
        }
    });
}

async function getFiles(req, res, session) {
    const { token } = await getGitHubToken(
        session.userId
    );

    const {
        repo,
        path: filePath = "",
        ref = ""
    } = req.query || {};

    const account = await getAccount(session.userId);

    if (!repo) {
        return res.status(400).json({
            success: false,
            message: "Repository wajib diisi"
        });
    }

    const params = {};

    if (filePath) {
        params.path = normalizePath(filePath);
    }

    if (ref) {
        params.ref = ref;
    }

    const response = await githubRequest({
        method: "GET",
        url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/contents/${filePath ? encodeURI(normalizePath(filePath)) : ""}`,
        params,
        headers: githubHeaders(token)
    });

    const data = Array.isArray(response.data)
        ? response.data
        : [response.data];

    return res.status(200).json({
        success: true,
        files: data.map(file => ({
            name: file.name,
            path: file.path,
            type: file.type,
            size: file.size,
            sha: file.sha,
            url: file.html_url,
            downloadUrl: file.download_url
        }))
    });
}

async function readFile(req, res, session) {
    const { token } = await getGitHubToken(
        session.userId
    );

    const account = await getAccount(session.userId);

    const {
        repo,
        path: filePath,
        ref = ""
    } = req.query || {};

    const safePath = normalizePath(filePath);

    if (!repo || !safePath) {
        return res.status(400).json({
            success: false,
            message: "Repository dan path wajib diisi"
        });
    }

    const params = {};

    if (ref) {
        params.ref = ref;
    }

    const response = await githubRequest({
        method: "GET",
        url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/contents/${safePath}`,
        params,
        headers: githubHeaders(token)
    });

    if (Array.isArray(response.data)) {
        return res.status(400).json({
            success: false,
            message: "Path tersebut adalah folder"
        });
    }

    const content = response.data.content
        ? Buffer.from(
              response.data.content.replace(/\n/g, ""),
              "base64"
          ).toString("utf8")
        : "";

    return res.status(200).json({
        success: true,
        file: {
            name: response.data.name,
            path: response.data.path,
            sha: response.data.sha,
            content
        }
    });
}

async function editFile(req, res, session) {
    const { token } = await getGitHubToken(
        session.userId
    );

    const account = await getAccount(session.userId);

    const {
        repo,
        path: filePath,
        content,
        message = "Update file",
        branch = "",
        sha = ""
    } = req.body || {};

    const safePath = normalizePath(filePath);

    if (!repo || !safePath) {
        return res.status(400).json({
            success: false,
            message: "Repository dan path wajib diisi"
        });
    }

    if (typeof content !== "string") {
        return res.status(400).json({
            success: false,
            message: "Content file wajib diisi"
        });
    }

    let currentSha = sha;

    if (!currentSha) {
        try {
            const existing = await githubRequest({
                method: "GET",
                url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/contents/${safePath}`,
                params: branch ? { ref: branch } : {},
                headers: githubHeaders(token)
            });

            currentSha = existing.data.sha;
        } catch (error) {
            if (error.response?.status !== 404) {
                throw error;
            }
        }
    }

    const data = {
        message: String(message || "Update file").slice(
            0,
            200
        ),
        content: Buffer.from(content).toString("base64")
    };

    if (branch) {
        data.branch = branch;
    }

    if (currentSha) {
        data.sha = currentSha;
    }

    const response = await githubRequest({
        method: "PUT",
        url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/contents/${safePath}`,
        headers: githubHeaders(token),
        data
    });

    return res.status(200).json({
        success: true,
        message: "File berhasil disimpan",
        commit: {
            sha: response.data.commit?.sha || "",
            url: response.data.commit?.html_url || ""
        }
    });
}

async function deleteFile(req, res, session) {
    const { token } = await getGitHubToken(
        session.userId
    );

    const account = await getAccount(session.userId);

    const {
        repo,
        path: filePath,
        message = "Delete file",
        branch = "",
        sha = ""
    } = req.body || {};

    const safePath = normalizePath(filePath);

    if (!repo || !safePath) {
        return res.status(400).json({
            success: false,
            message: "Repository dan path wajib diisi"
        });
    }

    let currentSha = sha;

    if (!currentSha) {
        const existing = await githubRequest({
            method: "GET",
            url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/contents/${safePath}`,
            params: branch ? { ref: branch } : {},
            headers: githubHeaders(token)
        });

        currentSha = existing.data.sha;
    }

    if (!currentSha) {
        return res.status(400).json({
            success: false,
            message: "SHA file tidak ditemukan"
        });
    }

    const data = {
        message: String(message || "Delete file").slice(
            0,
            200
        ),
        sha: currentSha
    };

    if (branch) {
        data.branch = branch;
    }

    const response = await githubRequest({
        method: "DELETE",
        url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/contents/${safePath}`,
        headers: githubHeaders(token),
        data
    });

    return res.status(200).json({
        success: true,
        message: "File berhasil dihapus",
        commit: {
            sha: response.data.commit?.sha || "",
            url: response.data.commit?.html_url || ""
        }
    });
}

function findZipRoot(entries) {
    const files = entries.filter(
        entry => !entry.isDirectory
    );

    if (!files.length) {
        return "";
    }

    const roots = new Set();

    for (const entry of files) {
        const normalized = normalizePath(entry.entryName);

        if (!normalized) {
            continue;
        }

        const parts = normalized.split("/");

        if (parts.length > 1) {
            roots.add(parts[0]);
        } else {
            roots.add("");
        }
    }

    if (roots.size === 1 && !roots.has("")) {
        return [...roots][0];
    }

    return "";
}

async function uploadZip(req, res, session) {
    const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "reycode-github-")
    );

    try {
        const form = formidable({
            multiples: false,
            maxFiles: 1,
            maxFileSize: MAX_ZIP_SIZE,
            uploadDir: tempDir,
            keepExtensions: true
        });

        const [fields, files] = await form.parse(req);

        const getField = name => {
            const value = fields[name];

            if (Array.isArray(value)) {
                return value[0];
            }

            return value || "";
        };

        const repo = String(getField("repo")).trim();
        const branch = String(getField("branch")).trim();
        const commitMessage =
            String(
                getField("commitMessage") ||
                    "Upload website"
            ).slice(0, 200);

        const uploaded = files.file;

        if (!repo) {
            return res.status(400).json({
                success: false,
                message: "Repository wajib diisi"
            });
        }

        const zipFile = Array.isArray(uploaded)
            ? uploaded[0]
            : uploaded;

        if (!zipFile?.filepath) {
            return res.status(400).json({
                success: false,
                message: "File ZIP wajib diupload"
            });
        }

        const zip = new AdmZip(zipFile.filepath);
        const entries = zip.getEntries();

        if (!entries.length) {
            return res.status(400).json({
                success: false,
                message: "ZIP kosong"
            });
        }

        const fileEntries = entries.filter(
            entry => !entry.isDirectory
        );

        if (fileEntries.length > MAX_FILES) {
            return res.status(400).json({
                success: false,
                message: `Maksimal ${MAX_FILES} file`
            });
        }

        const rootFolder = findZipRoot(entries);

        const extracted = [];

        for (const entry of fileEntries) {
            const originalPath = normalizePath(
                entry.entryName
            );

            if (!originalPath) {
                continue;
            }

            let filePath = originalPath;

            if (
                rootFolder &&
                filePath.startsWith(
                    `${rootFolder}/`
                )
            ) {
                filePath = filePath.slice(
                    rootFolder.length + 1
                );
            }

            if (!isSafeFile(filePath)) {
                return res.status(400).json({
                    success: false,
                    message: `Path file tidak aman: ${originalPath}`
                });
            }

            if (!filePath) {
                continue;
            }

            extracted.push({
                path: filePath,
                buffer: entry.getData()
            });
        }

        if (!extracted.length) {
            return res.status(400).json({
                success: false,
                message: "Tidak ada file valid di ZIP"
            });
        }

        const { token, account } =
            await getGitHubToken(session.userId);

        const repository = await getRepo(
            token,
            account.githubUsername,
            repo
        );

        const targetBranch =
            branch || repository.default_branch;

        const refResponse = await githubRequest({
            method: "GET",
            url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
            headers: githubHeaders(token)
        });

        const latestCommitSha =
            refResponse.data.object.sha;

        const commitResponse = await githubRequest({
            method: "GET",
            url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/git/commits/${latestCommitSha}`,
            headers: githubHeaders(token)
        });

        const baseTreeSha =
            commitResponse.data.tree.sha;

        const tree = [];

        for (const file of extracted) {
            const blobResponse = await githubRequest({
                method: "POST",
                url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/git/blobs`,
                headers: githubHeaders(token),
                data: {
                    content: file.buffer.toString(
                        "base64"
                    ),
                    encoding: "base64"
                }
            });

            tree.push({
                path: file.path,
                mode: "100644",
                type: "blob",
                sha: blobResponse.data.sha
            });
        }

        const treeResponse = await githubRequest({
            method: "POST",
            url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/git/trees`,
            headers: githubHeaders(token),
            data: {
                base_tree: baseTreeSha,
                tree
            }
        });

        const newTreeSha = treeResponse.data.sha;

        const newCommitResponse = await githubRequest({
            method: "POST",
            url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/git/commits`,
            headers: githubHeaders(token),
            data: {
                message: commitMessage,
                tree: newTreeSha,
                parents: [latestCommitSha]
            }
        });

        const newCommitSha =
            newCommitResponse.data.sha;

        await githubRequest({
            method: "PATCH",
            url: `${GITHUB_API}/repos/${encodeURIComponent(account.githubUsername)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
            headers: githubHeaders(token),
            data: {
                sha: newCommitSha,
                force: false
            }
        });

        return res.status(200).json({
            success: true,
            message: "ZIP berhasil diekstrak dan diupload ke GitHub",
            repository: {
                owner: account.githubUsername,
                name: repository.name,
                branch: targetBranch,
                commit: newCommitSha,
                files: extracted.length
            }
        });
    } catch (error) {
        if (error.code === "ETOOBIG") {
            return res.status(413).json({
                success: false,
                message: "Ukuran ZIP terlalu besar"
            });
        }

        throw error;
    } finally {
        await fs.rm(tempDir, {
            recursive: true,
            force: true
        }).catch(() => {});
    }
}

export default async function handler(req, res) {
    try {
        const session = await getSession(req);

        if (!session) {
            return res.status(401).json({
                success: false,
                message: "Silakan login terlebih dahulu"
            });
        }

        const action =
            String(
                req.query?.action ||
                    req.body?.action ||
                    ""
            ).toLowerCase();

        if (
            action === "connect" &&
            req.method === "POST"
        ) {
            return await connectGitHub(
                req,
                res,
                session
            );
        }

        if (
            action === "disconnect" &&
            req.method === "POST"
        ) {
            return await disconnectGitHub(
                req,
                res,
                session
            );
        }

        if (
            action === "me" &&
            req.method === "GET"
        ) {
            return await getMe(
                req,
                res,
                session
            );
        }

        if (
            action === "repos" &&
            req.method === "GET"
        ) {
            return await getRepos(
                req,
                res,
                session
            );
        }

        if (
            action === "create-repo" &&
            req.method === "POST"
        ) {
            return await createRepo(
                req,
                res,
                session
            );
        }

        if (
            action === "files" &&
            req.method === "GET"
        ) {
            return await getFiles(
                req,
                res,
                session
            );
        }

        if (
            action === "read" &&
            req.method === "GET"
        ) {
            return await readFile(
                req,
                res,
                session
            );
        }

        if (
            action === "edit" &&
            req.method === "POST"
        ) {
            return await editFile(
                req,
                res,
                session
            );
        }

        if (
            action === "delete" &&
            req.method === "POST"
        ) {
            return await deleteFile(
                req,
                res,
                session
            );
        }

        if (
            action === "upload" &&
            req.method === "POST"
        ) {
            return await uploadZip(
                req,
                res,
                session
            );
        }

        return res.status(400).json({
            success: false,
            message: "Action GitHub tidak dikenal"
        });
    } catch (error) {
        console.error(
            "GitHub API Error:",
            error.response?.data ||
                error.message ||
                error
        );

        const status =
            error.response?.status >= 400 &&
            error.response?.status < 600
                ? error.response.status
                : 500;

        return res.status(status).json({
            success: false,
            message:
                error.response?.data?.message ||
                error.message ||
                "Terjadi kesalahan pada GitHub API"
        });
    }
}