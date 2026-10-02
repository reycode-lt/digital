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
    "web-api.my.id",
    "monikalabs.web.id"
];

const ALLOWED_SOURCE_TYPES = [
    "repo",
    "zip",
    "file",
    "html"
];

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;
const MAX_TOTAL_ZIP_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 1000;

/* =========================================================
   RESPONSE
========================================================= */

function send(res, status, data) {
    return res.status(status).json(data);
}

/* =========================================================
   HELPERS
========================================================= */

function slugify(value) {
    return (
        String(value || "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60) || "project"
    );
}

function headers(contentType = "application/json") {
    if (!process.env.API_VERCEL) {
        throw new Error("API_VERCEL belum diatur");
    }

    return {
        Authorization: `Bearer ${process.env.API_VERCEL}`,
        "Content-Type": contentType
    };
}

/* =========================================================
   VERCEL API
========================================================= */

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

/* =========================================================
   AUTHENTICATION
========================================================= */

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

/* =========================================================
   FORM DATA
========================================================= */

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
        if (!item) {
            continue;
        }

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

/* =========================================================
   REPOSITORY
========================================================= */

function normalizeRepo(url) {
    const value = String(url || "").trim();

    if (!value) {
        throw new Error("Repository URL wajib diisi");
    }

    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error("Repository URL tidak valid");
    }

    const hostname = parsed.hostname.toLowerCase();

    if (
        parsed.protocol !== "https:" ||
        ![
            "github.com",
            "www.github.com",
            "gitlab.com",
            "www.gitlab.com",
            "bitbucket.org",
            "www.bitbucket.org"
        ].includes(hostname)
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
        throw new Error("Repository GitHub tidak valid");
    }

    return {
        owner: parts[0],
        repo: parts[1]
    };
}

async function getGitHubRepo(owner, repo) {
    const result = await axios({
        method: "GET",
        url: `https://api.github.com/repos/${encodeURIComponent(
            owner
        )}/${encodeURIComponent(repo)}`,
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "ReyCode-Deploy"
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

async function getGitHubFile(
    owner,
    repo,
    branch,
    filename
) {
    const result = await axios({
        method: "GET",
        url: `https://api.github.com/repos/${encodeURIComponent(
            owner
        )}/${encodeURIComponent(
            repo
        )}/contents/${filename}?ref=${encodeURIComponent(branch)}`,
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "ReyCode-Deploy"
        },
        timeout: 20000,
        validateStatus: () => true
    });

    if (result.status === 404) {
        return null;
    }

    if (result.status !== 200) {
        throw new Error(
            `Gagal membaca ${filename} dari GitHub`
        );
    }

    if (
        result.data?.type !== "file" ||
        !result.data?.content
    ) {
        return null;
    }

    return Buffer.from(
        result.data.content.replace(/\s/g, ""),
        "base64"
    );
}

/* =========================================================
   PROJECT DETECTION
========================================================= */

function parseJsonBuffer(buffer, filename) {
    if (!buffer) {
        return null;
    }

    try {
        return JSON.parse(
            buffer.toString("utf8")
        );
    } catch {
        throw new Error(`${filename} tidak valid`);
    }
}

function findProjectFile(files, filename) {
    const target = filename.toLowerCase();

    return (
        files.find(
            item =>
                String(item.file).toLowerCase() === target
        ) || null
    );
}

function getDependencies(packageJson) {
    return {
        ...(packageJson?.dependencies || {}),
        ...(packageJson?.devDependencies || {}),
        ...(packageJson?.peerDependencies || {})
    };
}

function hasDependency(dependencies, names) {
    return names.some(name =>
        Object.prototype.hasOwnProperty.call(
            dependencies,
            name
        )
    );
}

function scriptsContain(scripts, names) {
    const values = Object.values(scripts || {});

    const combined = values
        .map(value =>
            String(value || "").toLowerCase()
        )
        .join(" ");

    return names.some(name =>
        combined.includes(
            String(name).toLowerCase()
        )
    );
}

function detectFramework(
    packageJson = null,
    vercelJson = null
) {
    if (
        vercelJson &&
        Object.prototype.hasOwnProperty.call(
            vercelJson,
            "framework"
        )
    ) {
        return vercelJson.framework;
    }

    const dependencies =
        getDependencies(packageJson);

    if (
        hasDependency(dependencies, [
            "next"
        ])
    ) {
        return "nextjs";
    }

    if (
        hasDependency(dependencies, [
            "nuxt"
        ])
    ) {
        return "nuxtjs";
    }

    if (
        hasDependency(dependencies, [
            "@sveltejs/kit"
        ])
    ) {
        return "sveltekit";
    }

    if (
        hasDependency(dependencies, [
            "astro"
        ])
    ) {
        return "astro";
    }

    if (
        hasDependency(dependencies, [
            "@remix-run/dev",
            "@remix-run/react",
            "@remix-run/node",
            "remix"
        ])
    ) {
        return "remix";
    }

    if (
        hasDependency(dependencies, [
            "@angular/core",
            "@angular/cli"
        ])
    ) {
        return "angular";
    }

    if (
        hasDependency(dependencies, [
            "@tanstack/start"
        ])
    ) {
        return "tanstack-start";
    }

    if (
        hasDependency(dependencies, [
            "@solidjs/start",
            "solid-start"
        ])
    ) {
        return "solidstart";
    }

    if (
        hasDependency(dependencies, [
            "gatsby"
        ])
    ) {
        return "gatsby";
    }

    if (
        hasDependency(dependencies, [
            "react-scripts"
        ])
    ) {
        return "create-react-app";
    }

    if (
        hasDependency(dependencies, [
            "preact"
        ])
    ) {
        return "preact";
    }

    if (
        hasDependency(dependencies, [
            "vite"
        ])
    ) {
        return "vite";
    }

    if (
        hasDependency(dependencies, [
            "vue"
        ])
    ) {
        return "vue";
    }

    if (
        hasDependency(dependencies, [
            "@sveltejs/vite-plugin-svelte",
            "svelte"
        ])
    ) {
        return "svelte";
    }

    if (
        hasDependency(dependencies, [
            "express"
        ])
    ) {
        return "express";
    }

    if (
        hasDependency(dependencies, [
            "fastify"
        ])
    ) {
        return "fastify";
    }

    if (
        hasDependency(dependencies, [
            "hono"
        ])
    ) {
        return "hono";
    }

    if (
        hasDependency(dependencies, [
            "@nestjs/core"
        ])
    ) {
        return "nestjs";
    }

    if (
        hasDependency(dependencies, [
            "koa"
        ])
    ) {
        return "koa";
    }

    if (
        hasDependency(dependencies, [
            "@hapi/hapi"
        ])
    ) {
        return "hapi";
    }

    if (
        hasDependency(dependencies, [
            "elysia"
        ])
    ) {
        return "elysia";
    }

    if (
        hasDependency(dependencies, [
            "h3"
        ])
    ) {
        return "h3";
    }

    const scripts =
        packageJson?.scripts || {};

    if (
        scriptsContain(scripts, [
            "next build",
            "next dev"
        ])
    ) {
        return "nextjs";
    }

    if (
        scriptsContain(scripts, [
            "nuxt build",
            "nuxt dev"
        ])
    ) {
        return "nuxtjs";
    }

    if (
        scriptsContain(scripts, [
            "astro build",
            "astro dev"
        ])
    ) {
        return "astro";
    }

    if (
        scriptsContain(scripts, [
            "vite build",
            "vite dev"
        ])
    ) {
        return "vite";
    }

    if (
        scriptsContain(scripts, [
            "svelte-kit"
        ])
    ) {
        return "sveltekit";
    }

    if (
        scriptsContain(scripts, [
            "ng build",
            "ng serve"
        ])
    ) {
        return "angular";
    }

    if (
        scriptsContain(scripts, [
            "remix build",
            "remix vite"
        ])
    ) {
        return "remix";
    }

    if (
        scriptsContain(scripts, [
            "react-scripts"
        ])
    ) {
        return "create-react-app";
    }

    return null;
}

function buildProjectSettings(
    packageJson = null,
    vercelJson = null
) {
    const framework =
        detectFramework(
            packageJson,
            vercelJson
        );

    const settings = {
        framework: framework || null
    };

    if (
        vercelJson &&
        Object.prototype.hasOwnProperty.call(
            vercelJson,
            "buildCommand"
        )
    ) {
        settings.buildCommand =
            vercelJson.buildCommand;
    }

    if (
        vercelJson &&
        Object.prototype.hasOwnProperty.call(
            vercelJson,
            "devCommand"
        )
    ) {
        settings.devCommand =
            vercelJson.devCommand;
    }

    if (
        vercelJson &&
        Object.prototype.hasOwnProperty.call(
            vercelJson,
            "installCommand"
        )
    ) {
        settings.installCommand =
            vercelJson.installCommand;
    }

    if (
        vercelJson &&
        Object.prototype.hasOwnProperty.call(
            vercelJson,
            "outputDirectory"
        )
    ) {
        settings.outputDirectory =
            vercelJson.outputDirectory;
    }

    if (
        vercelJson &&
        Object.prototype.hasOwnProperty.call(
            vercelJson,
            "nodeVersion"
        )
    ) {
        settings.nodeVersion =
            vercelJson.nodeVersion;
    }

    return settings;
}

function inspectProjectFiles(files) {
    const packageFile =
        findProjectFile(
            files,
            "package.json"
        );

    const vercelFile =
        findProjectFile(
            files,
            "vercel.json"
        );

    const packageJson =
        packageFile
            ? parseJsonBuffer(
                packageFile.buffer,
                "package.json"
            )
            : null;

    const vercelJson =
        vercelFile
            ? parseJsonBuffer(
                vercelFile.buffer,
                "vercel.json"
            )
            : null;

    const framework =
        detectFramework(
            packageJson,
            vercelJson
        );

    const hasIndex =
        Boolean(
            findProjectFile(
                files,
                "index.html"
            )
        );

    if (
        !framework &&
        !hasIndex &&
        !packageJson &&
        !vercelJson
    ) {
        throw new Error(
            "Framework tidak terdeteksi dan index.html tidak ditemukan"
        );
    }

    return {
        packageJson,
        vercelJson,
        framework,
        projectSettings:
            buildProjectSettings(
                packageJson,
                vercelJson
            )
    };
}

async function inspectGitHubProject(
    owner,
    repo,
    branch
) {
    const packageBuffer =
        await getGitHubFile(
            owner,
            repo,
            branch,
            "package.json"
        );

    const vercelBuffer =
        await getGitHubFile(
            owner,
            repo,
            branch,
            "vercel.json"
        );

    const packageJson =
        packageBuffer
            ? parseJsonBuffer(
                packageBuffer,
                "package.json"
            )
            : null;

    const vercelJson =
        vercelBuffer
            ? parseJsonBuffer(
                vercelBuffer,
                "vercel.json"
            )
            : null;

    const framework =
        detectFramework(
            packageJson,
            vercelJson
        );

    return {
        packageJson,
        vercelJson,
        framework,
        projectSettings:
            buildProjectSettings(
                packageJson,
                vercelJson
            )
    };
}

/* =========================================================
   VERCEL PROJECT
========================================================= */

async function getProject(slug) {
    try {
        return await vercel(
            "GET",
            `/v9/projects/${encodeURIComponent(slug)}`
        );
    } catch (error) {
        if (error.status === 404) {
            return null;
        }

        throw error;
    }
}

async function createProject(
    slug,
    projectSettings
) {
    return await vercel(
        "POST",
        "/v10/projects?skipAutoDetectionConfirmation=1",
        {
            name: slug,
            projectSettings
        }
    );
}

async function getOrCreateProject(
    slug,
    projectSettings
) {
    const existing =
        await getProject(slug);

    if (existing) {
        return existing;
    }

    return await createProject(
        slug,
        projectSettings
    );
}

function getVercelTeamId(project) {
    const configured =
        process.env.VERCEL_TEAM_ID ||
        process.env.VERCEL_TEAM;

    if (configured) {
        return configured;
    }

    const accountId =
        project?.accountId;

    if (
        typeof accountId === "string" &&
        accountId.startsWith("team_")
    ) {
        return accountId;
    }

    return "";
}

/* =========================================================
   VERCEL FILE UPLOAD
========================================================= */

async function uploadVercelFile(
    buffer,
    project = null
) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error(
            "Data file tidak valid"
        );
    }

    if (!buffer.length) {
        throw new Error(
            "File kosong"
        );
    }

    if (!process.env.API_VERCEL) {
        throw new Error(
            "API_VERCEL belum diatur"
        );
    }

    const sha =
        crypto
            .createHash("sha1")
            .update(buffer)
            .digest("hex");

    const teamId =
        getVercelTeamId(project);

    const query =
        teamId
            ? `?teamId=${encodeURIComponent(teamId)}`
            : "";

    const result =
        await axios({
            method: "POST",
            url: `${VERCEL_API}/v2/files${query}`,
            headers: {
                Authorization:
                    `Bearer ${process.env.API_VERCEL}`,
                "Content-Type":
                    "application/octet-stream",
                "Content-Length":
                    String(buffer.length),
                "x-now-digest":
                    sha,
                "x-vercel-digest":
                    sha
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
        const vercelMessage =
            result.data?.error?.message ||
            result.data?.message ||
            (
                typeof result.data === "string"
                    ? result.data
                    : ""
            );

        const error =
            new Error(
                vercelMessage ||
                `Upload Vercel gagal (${result.status})`
            );

        error.status =
            result.status;

        error.data =
            result.data;

        throw error;
    }

    return {
        sha,
        size: buffer.length
    };
}

/* =========================================================
   ZIP SECURITY
========================================================= */

function normalizeZipPath(filename) {
    const original =
        String(filename || "")
            .replace(/\\/g, "/");

    if (
        !original ||
        original.startsWith("/") ||
        original.includes("../") ||
        original.includes("/..") ||
        original.includes("\0")
    ) {
        return null;
    }

    let value =
        original
            .replace(/^\/+/g, "")
            .replace(/^(\.\/)+/g, "");

    value =
        path.posix.normalize(value);

    if (
        !value ||
        value === "." ||
        value === ".." ||
        value.startsWith("../") ||
        value.includes("/../") ||
        path.posix.isAbsolute(value)
    ) {
        return null;
    }

    return value;
}

function getCommonZipRoot(files) {
    if (!files.length) {
        return "";
    }

    const firstParts =
        files[0].file.split("/");

    if (firstParts.length <= 1) {
        return "";
    }

    const root =
        firstParts[0];

    const allSameRoot =
        files.every(item => {
            const parts =
                item.file.split("/");

            return (
                parts.length > 1 &&
                parts[0] === root
            );
        });

    if (!allSameRoot) {
        return "";
    }

    return `${root}/`;
}

function stripCommonRoot(files) {
    const root =
        getCommonZipRoot(files);

    if (!root) {
        return files;
    }

    const rootFiles =
        files.map(item => ({
            ...item,
            file:
                item.file.slice(
                    root.length
                )
        }));

    const hasProjectRootFile =
        rootFiles.some(item =>
            [
                "package.json",
                "vercel.json",
                "index.html"
            ].includes(
                String(item.file).toLowerCase()
            )
        );

    if (!hasProjectRootFile) {
        return files;
    }

    return rootFiles.filter(
        item => item.file
    );
}

function readZip(zipPath) {
    const zip =
        new AdmZip(zipPath);

    const entries =
        zip.getEntries();

    if (
        entries.length >
        MAX_FILES
    ) {
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
            throw new Error(
                "ZIP memiliki path file yang tidak valid"
            );
        }

        const buffer =
            entry.getData();

        totalSize +=
            buffer.length;

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

    return stripCommonRoot(files);
}

/* =========================================================
   UPLOAD PREPARATION
========================================================= */

async function prepareUploadedFiles(
    uploadedFile
) {
    if (!uploadedFile?.filepath) {
        throw new Error(
            "File upload tidak ditemukan"
        );
    }

    const originalName =
        String(
            uploadedFile.originalFilename ||
            ""
        ).trim();

    const filename =
        originalName.toLowerCase();

    const mimetype =
        String(
            uploadedFile.mimetype ||
            ""
        ).toLowerCase();

    const isZip =
        filename.endsWith(".zip") ||
        mimetype.includes("zip") ||
        mimetype.includes("compressed");

    if (isZip) {
        return readZip(
            uploadedFile.filepath
        );
    }

    const isHtml =
        filename.endsWith(".html") ||
        filename.endsWith(".htm") ||
        mimetype.includes("text/html") ||
        mimetype.includes("html");

    if (!isHtml) {
        throw new Error(
            "File tunggal hanya mendukung HTML (.html / .htm)"
        );
    }

    const buffer =
        await fs.readFile(
            uploadedFile.filepath
        );

    if (!buffer.length) {
        throw new Error(
            "File HTML kosong"
        );
    }

    return [
        {
            file: "index.html",
            buffer
        }
    ];
}

/* =========================================================
   UPLOAD PROJECT FILES
========================================================= */

async function uploadProjectFiles(
    files,
    project
) {
    if (!Array.isArray(files)) {
        throw new Error(
            "Daftar file project tidak valid"
        );
    }

    if (!files.length) {
        throw new Error(
            "Tidak ada file yang dapat dideploy"
        );
    }

    if (
        files.length >
        MAX_FILES
    ) {
        throw new Error(
            "Project berisi terlalu banyak file"
        );
    }

    const uploaded = [];

    for (const item of files) {
        if (
            !item?.file ||
            !Buffer.isBuffer(item.buffer)
        ) {
            throw new Error(
                "Data file project tidak valid"
            );
        }

        const result =
            await uploadVercelFile(
                item.buffer,
                project
            );

        uploaded.push({
            file: item.file,
            sha: result.sha,
            size: result.size
        });
    }

    return uploaded;
}

/* =========================================================
   DEPLOYMENT
========================================================= */

async function deployFiles(
    project,
    files,
    projectSettings = {
        framework: null
    }
) {
    if (!project?.id) {
        throw new Error(
            "Vercel project ID tidak ditemukan"
        );
    }

    return await vercel(
        "POST",
        "/v13/deployments?skipAutoDetectionConfirmation=1",
        {
            name: project.name,
            project: project.id,
            target: "production",
            files,
            projectSettings
        }
    );
}

async function deployGitHub(
    project,
    repositoryUrl,
    projectSettings = {
        framework: null
    }
) {
    const repoUrl =
        normalizeRepo(
            repositoryUrl
        );

    const parsed =
        new URL(repoUrl);

    const hostname =
        parsed.hostname.toLowerCase();

    if (
        hostname !== "github.com" &&
        hostname !== "www.github.com"
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
        "/v13/deployments?skipAutoDetectionConfirmation=1",
        {
            name: project.name,
            project: project.id,
            target: "production",
            gitSource: {
                type: "github",
                repoId:
                    githubRepo.id,
                ref: branch
            },
            projectSettings
        }
    );
}

/* =========================================================
   DOMAIN
========================================================= */

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

/* =========================================================
   DEPLOYMENT STATUS
========================================================= */

async function getDeployment(id) {
    return await vercel(
        "GET",
        `/v13/deployments/${encodeURIComponent(id)}`
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
            remote.readyState === "READY"
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
            remote.readyState === "ERROR" ||
            remote.readyState === "CANCELED"
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

/* =========================================================
   CLEANUP
========================================================= */

async function cleanupUpload(file) {
    if (!file?.filepath) {
        return;
    }

    try {
        await fs.unlink(
            file.filepath
        );
    } catch {
        // File sudah tidak ada
    }
}

/* =========================================================
   CREATE DEPLOYMENT
========================================================= */

async function createDeployment(
    req,
    res,
    userId
) {
    const contentType =
        req.headers["content-type"] ||
        "";

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
            typeof body === "string"
        ) {
            try {
                body =
                    JSON.parse(body);
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
                body.sourceType || ""
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
        domain.trim().toLowerCase();

    sourceType =
        sourceType
            .trim()
            .toLowerCase();

    repositoryUrl =
        repositoryUrl.trim();

    if (!name) {
        return send(res, 400, {
            success: false,
            message:
                "Project name wajib diisi"
        });
    }

    if (
        !ALLOWED_DOMAINS.includes(
            domain
        )
    ) {
        return send(res, 400, {
            success: false,
            message:
                "Domain tidak valid"
        });
    }

    if (
        !ALLOWED_SOURCE_TYPES.includes(
            sourceType
        )
    ) {
        return send(res, 400, {
            success: false,
            message:
                "Source deployment tidak valid"
        });
    }

    if (
        sourceType === "repo" &&
        !repositoryUrl
    ) {
        return send(res, 400, {
            success: false,
            message:
                "Repository URL wajib diisi"
        });
    }

    if (
        [
            "zip",
            "file",
            "html"
        ].includes(sourceType) &&
        !uploadedFile
    ) {
        return send(res, 400, {
            success: false,
            message:
                "File project wajib diupload"
        });
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
        return send(res, 409, {
            success: false,
            message:
                "Nama project sudah digunakan"
        });
    }

    let normalizedRepo = "";

    let projectSettings = {
        framework: null
    };

    let preparedFiles = null;
    let detectedFramework = null;

    try {
        if (
            sourceType === "repo"
        ) {
            normalizedRepo =
                normalizeRepo(
                    repositoryUrl
                );

            const {
                owner,
                repo
            } =
                parseGitHubRepo(
                    normalizedRepo
                );

            const githubRepo =
                await getGitHubRepo(
                    owner,
                    repo
                );

            const branch =
                githubRepo.default_branch ||
                "main";

            const detected =
                await inspectGitHubProject(
                    owner,
                    repo,
                    branch
                );

            projectSettings =
                detected.projectSettings;

            detectedFramework =
                detected.framework;
        } else {
            preparedFiles =
                await prepareUploadedFiles(
                    uploadedFile
                );

            const detected =
                inspectProjectFiles(
                    preparedFiles
                );

            projectSettings =
                detected.projectSettings;

            detectedFramework =
                detected.framework;
        }

        console.log(
            "FRAMEWORK DETECTED:",
            detectedFramework ||
            "static/auto"
        );

        console.log(
            "PROJECT SETTINGS:",
            JSON.stringify(
                projectSettings
            )
        );

        const project =
            await getOrCreateProject(
                slug,
                projectSettings
            );

        let result;
        let uploadFileName = "";

        if (
            sourceType === "repo"
        ) {
            result =
                await deployGitHub(
                    project,
                    normalizedRepo,
                    projectSettings
                );
        } else {
            uploadFileName =
                uploadedFile?.originalFilename ||
                (
                    sourceType === "html"
                        ? "index.html"
                        : sourceType === "file"
                            ? "project"
                            : "project.zip"
                );

            const files =
                await uploadProjectFiles(
                    preparedFiles,
                    project
                );

            result =
                await deployFiles(
                    project,
                    files,
                    projectSettings
                );
        }

        const customUrl =
            `https://${slug}.${domain}`;

        let domainConfigured =
            false;

        try {
            const domainResult =
                await addDomain(
                    project.id,
                    customUrl
                );

            domainConfigured =
                Boolean(domainResult);
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
                sourceType,
                repositoryUrl:
                    sourceType === "repo"
                        ? normalizedRepo
                        : "",
                zipFileName:
                    [
                        "zip",
                        "file",
                        "html"
                    ].includes(sourceType)
                        ? uploadFileName
                        : "",
                preset:
                    detectedFramework ||
                    preset ||
                    "Auto Detect",
                status: "deploying",
                lastDeploymentId:
                    result.id || "",
                errorMessage: ""
            });

        return send(res, 201, {
            success: true,
            message:
                "Deployment berhasil dikirim ke Vercel",
            framework:
                detectedFramework ||
                "static",
            projectSettings,
            deployment,
            domainConfigured
        });
    } finally {
        await cleanupUpload(
            uploadedFile
        );
    }
}

/* =========================================================
   UPDATE / REDEPLOY
========================================================= */

async function updateDeployment(
    req,
    res,
    userId
) {
    const contentType =
        req.headers["content-type"] ||
        "";

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
            typeof body === "string"
        ) {
            try {
                body =
                    JSON.parse(body);
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

    id =
        id.trim();

    sourceType =
        sourceType
            .trim()
            .toLowerCase();

    repositoryUrl =
        repositoryUrl.trim();

    if (!id) {
        return send(res, 400, {
            success: false,
            message:
                "Deployment ID wajib diisi"
        });
    }

    if (
        !ALLOWED_SOURCE_TYPES.includes(
            sourceType
        )
    ) {
        return send(res, 400, {
            success: false,
            message:
                "Source deployment tidak valid"
        });
    }

    if (
        sourceType === "repo" &&
        !repositoryUrl
    ) {
        return send(res, 400, {
            success: false,
            message:
                "Repository URL wajib diisi"
        });
    }

    if (
        [
            "zip",
            "file",
            "html"
        ].includes(sourceType) &&
        !uploadedFile
    ) {
        return send(res, 400, {
            success: false,
            message:
                "File project wajib diupload"
        });
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
        return send(res, 404, {
            success: false,
            message:
                "Deployment tidak ditemukan"
        });
    }

    let projectSettings = {
        framework: null
    };

    let detectedFramework = null;
    let normalizedRepo = "";
    let preparedFiles = null;

    try {
        if (
            sourceType === "repo"
        ) {
            normalizedRepo =
                normalizeRepo(
                    repositoryUrl
                );

            const {
                owner,
                repo
            } =
                parseGitHubRepo(
                    normalizedRepo
                );

            const githubRepo =
                await getGitHubRepo(
                    owner,
                    repo
                );

            const branch =
                githubRepo.default_branch ||
                "main";

            const detected =
                await inspectGitHubProject(
                    owner,
                    repo,
                    branch
                );

            projectSettings =
                detected.projectSettings;

            detectedFramework =
                detected.framework;
        } else {
            preparedFiles =
                await prepareUploadedFiles(
                    uploadedFile
                );

            const detected =
                inspectProjectFiles(
                    preparedFiles
                );

            projectSettings =
                detected.projectSettings;

            detectedFramework =
                detected.framework;
        }

        console.log(
            "REDEPLOY FRAMEWORK:",
            detectedFramework ||
            "static/auto"
        );

        console.log(
            "REDEPLOY PROJECT SETTINGS:",
            JSON.stringify(
                projectSettings
            )
        );

        const project =
            await getOrCreateProject(
                deployment.slug,
                projectSettings
            );

        let result;

        if (
            sourceType === "repo"
        ) {
            result =
                await deployGitHub(
                    project,
                    normalizedRepo,
                    projectSettings
                );
        } else {
            const files =
                await uploadProjectFiles(
                    preparedFiles,
                    project
                );

            result =
                await deployFiles(
                    project,
                    files,
                    projectSettings
                );
        }

        deployment.sourceType =
            sourceType;

        deployment.repositoryUrl =
            sourceType === "repo"
                ? normalizedRepo
                : "";

        deployment.zipFileName =
            [
                "zip",
                "file",
                "html"
            ].includes(sourceType)
                ? (
                    uploadedFile?.originalFilename ||
                    (
                        sourceType === "html"
                            ? "index.html"
                            : sourceType === "file"
                                ? "project"
                                : "project.zip"
                    )
                )
                : "";

        deployment.vercelProjectId =
            project.id || "";

        deployment.lastDeploymentId =
            result.id || "";

        deployment.status =
            "deploying";

        deployment.errorMessage =
            "";

        deployment.preset =
            detectedFramework ||
            "Auto Detect";

        if (result.url) {
            deployment.vercelUrl =
                `https://${result.url}`;
        }

        await deployment.save();

        return send(res, 200, {
            success: true,
            message:
                "Redeploy berhasil dikirim",
            framework:
                detectedFramework ||
                "static",
            projectSettings,
            deployment
        });
    } finally {
        await cleanupUpload(
            uploadedFile
        );
    }
}

/* =========================================================
   DELETE DEPLOYMENT
========================================================= */

async function deleteDeployment(
    req,
    res,
    userId
) {
    let body =
        req.body || {};

    if (
        typeof body === "string"
    ) {
        try {
            body =
                JSON.parse(body);
        } catch {
            body = {};
        }
    }

    const id =
        body.id;

    if (!id) {
        return send(res, 400, {
            success: false,
            message:
                "Deployment ID wajib diisi"
        });
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
        return send(res, 404, {
            success: false,
            message:
                "Deployment tidak ditemukan"
        });
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

    return send(res, 200, {
        success: true,
        message:
            "Deployment berhasil dihapus"
    });
}

/* =========================================================
   LIST DEPLOYMENTS
========================================================= */

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

    return send(res, 200, {
        success: true,
        deployments:
            deployments.map(
                item =>
                    item.toObject()
            )
    });
}

/* =========================================================
   MAIN HANDLER
========================================================= */

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
            req.method === "GET"
        ) {
            return await listDeployments(
                res,
                user.userId
            );
        }

        if (
            req.method === "POST"
        ) {
            return await createDeployment(
                req,
                res,
                user.userId
            );
        }

        if (
            req.method === "PATCH"
        ) {
            return await updateDeployment(
                req,
                res,
                user.userId
            );
        }

        if (
            req.method === "DELETE"
        ) {
            return await deleteDeployment(
                req,
                res,
                user.userId
            );
        }

        return send(res, 405, {
            success: false,
            message:
                "Method tidak diizinkan"
        });
    } catch (error) {
        console.error(
            "DEPLOY API ERROR:",
            error
        );

        if (
            error?.code ===
                "LIMIT_FILE_SIZE" ||
            error?.code === "ETOOBIG" ||
            error?.httpCode === 413
        ) {
            return send(res, 413, {
                success: false,
                message:
                    "Ukuran file terlalu besar. Maksimal 4 MB untuk upload langsung."
            });
        }

        if (
            error?.code === 11000
        ) {
            return send(res, 409, {
                success: false,
                message:
                    "Project dengan nama tersebut sudah ada"
            });
        }

        const status =
            Number(error?.status);

        if (
            status >= 400 &&
            status < 500
        ) {
            return send(res, status, {
                success: false,
                message:
                    error.message ||
                    "Request ke Vercel ditolak",
                vercel:
                    error.data || null
            });
        }

        return send(res, 500, {
            success: false,
            message:
                error?.message ||
                "Deployment gagal"
        });
    }
}
