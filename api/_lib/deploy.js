import crypto from "crypto";
import Deployment from "../../models/Deployment.js";

const VERCEL_API = "https://api.vercel.com";

const ALLOWED_DOMAINS = [
    "reycode.my.id",
    "reycode.web.id",
    "web-api.my.id"
];

function getToken() {
    if (!process.env.API_VERCEL) {
        throw new Error("API_VERCEL belum diatur");
    }

    return process.env.API_VERCEL;
}

async function vercelRequest(endpoint, options = {}) {
    const response = await fetch(`${VERCEL_API}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        data = {
            error: text
        };
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            "Vercel API request gagal";

        throw new Error(message);
    }

    return data;
}

function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || "project";
}

function validateDomain(domain) {
    if (!ALLOWED_DOMAINS.includes(domain)) {
        throw new Error("Domain tidak tersedia");
    }
}

function getCustomDomain(slug, domain) {
    return `${slug}.${domain}`;
}

async function createProject(name) {
    return await vercelRequest("/v9/projects", {
        method: "POST",
        body: JSON.stringify({
            name,
            framework: null
        })
    });
}

async function addProjectDomain(projectId, domain) {
    return await vercelRequest(
        `/v9/projects/${encodeURIComponent(projectId)}/domains`,
        {
            method: "POST",
            body: JSON.stringify({
                name: domain
            })
        }
    );
}

async function createGitDeployment({
    projectId,
    repositoryUrl
}) {
    return await vercelRequest("/v13/deployments", {
        method: "POST",
        body: JSON.stringify({
            name: projectId,
            project: projectId,
            gitSource: {
                type: "github",
                repo: repositoryUrl
            }
        })
    });
}

async function createFileDeployment({
    projectId,
    files
}) {
    return await vercelRequest("/v13/deployments", {
        method: "POST",
        body: JSON.stringify({
            name: projectId,
            project: projectId,
            files
        })
    });
}

export async function deployWebsite({
    userId,
    name,
    domain,
    repositoryUrl = "",
    files = []
}) {
    if (!userId) {
        throw new Error("User ID wajib diisi");
    }

    if (!name?.trim()) {
        throw new Error("Project name wajib diisi");
    }

    validateDomain(domain);

    if (
        !repositoryUrl &&
        (!Array.isArray(files) || !files.length)
    ) {
        throw new Error(
            "Repository atau file ZIP wajib tersedia"
        );
    }

    if (
        repositoryUrl &&
        Array.isArray(files) &&
        files.length
    ) {
        throw new Error(
            "Repository dan ZIP tidak boleh digunakan bersamaan"
        );
    }

    const slug = slugify(name);

    const existing = await Deployment.findOne({
        userId,
        slug,
        status: {
            $ne: "deleted"
        }
    });

    if (existing) {
        throw new Error(
            "Project dengan nama tersebut sudah ada"
        );
    }

    const project = await createProject(slug);

    const projectId =
        project.id ||
        project.name;

    const customDomain = getCustomDomain(
        slug,
        domain
    );

    await addProjectDomain(
        projectId,
        customDomain
    );

    let deployment;

    if (repositoryUrl) {
        deployment = await createGitDeployment({
            projectId,
            repositoryUrl
        });
    } else {
        deployment = await createFileDeployment({
            projectId,
            files
        });
    }

    const vercelUrl = deployment.url
        ? `https://${deployment.url}`
        : "";

    const record = await Deployment.create({
        userId,
        name: name.trim(),
        slug,
        domain,

        vercelProjectId: projectId,

        vercelUrl,

        customUrl:
            `https://${customDomain}`,

        sourceType:
            repositoryUrl
                ? "repo"
                : "zip",

        repositoryUrl:
            repositoryUrl || "",

        preset: "Auto Detect",

        status:
            deployment.readyState === "ERROR"
                ? "failed"
                : "deploying",

        lastDeploymentId:
            deployment.id || ""
    });

    return {
        success: true,
        deployment: record,
        vercel: deployment
    };
}

export async function redeployWebsite({
    deploymentId,
    userId,
    repositoryUrl = "",
    files = []
}) {
    if (!deploymentId) {
        throw new Error(
            "Deployment ID wajib diisi"
        );
    }

    if (!userId) {
        throw new Error(
            "User ID wajib diisi"
        );
    }

    if (
        !repositoryUrl &&
        (!Array.isArray(files) || !files.length)
    ) {
        throw new Error(
            "Repository atau ZIP wajib tersedia"
        );
    }

    if (
        repositoryUrl &&
        Array.isArray(files) &&
        files.length
    ) {
        throw new Error(
            "Repository dan ZIP tidak boleh digunakan bersamaan"
        );
    }

    const record = await Deployment.findOne({
        _id: deploymentId,
        userId,
        status: {
            $ne: "deleted"
        }
    });

    if (!record) {
        throw new Error(
            "Deployment tidak ditemukan"
        );
    }

    let deployment;

    if (repositoryUrl) {
        deployment = await createGitDeployment({
            projectId: record.vercelProjectId,
            repositoryUrl
        });

        record.sourceType = "repo";
        record.repositoryUrl = repositoryUrl;
    } else {
        deployment = await createFileDeployment({
            projectId: record.vercelProjectId,
            files
        });

        record.sourceType = "zip";
        record.repositoryUrl = "";
    }

    record.status =
        deployment.readyState === "ERROR"
            ? "failed"
            : "deploying";

    record.lastDeploymentId =
        deployment.id || "";

    if (deployment.url) {
        record.vercelUrl =
            `https://${deployment.url}`;
    }

    await record.save();

    return {
        success: true,
        deployment: record,
        vercel: deployment
    };
}

export async function deleteDeployment({
    deploymentId,
    userId
}) {
    if (!deploymentId) {
        throw new Error(
            "Deployment ID wajib diisi"
        );
    }

    if (!userId) {
        throw new Error(
            "User ID wajib diisi"
        );
    }

    const record = await Deployment.findOne({
        _id: deploymentId,
        userId,
        status: {
            $ne: "deleted"
        }
    });

    if (!record) {
        throw new Error(
            "Deployment tidak ditemukan"
        );
    }

    if (record.lastDeploymentId) {
        try {
            await vercelRequest(
                `/v13/deployments/${encodeURIComponent(
                    record.lastDeploymentId
                )}`,
                {
                    method: "DELETE"
                }
            );
        } catch {
        }
    }

    if (record.vercelProjectId) {
        await vercelRequest(
            `/v9/projects/${encodeURIComponent(
                record.vercelProjectId
            )}`,
            {
                method: "DELETE"
            }
        );
    }

    record.status = "deleted";

    await record.save();

    return {
        success: true,
        message: "Deployment berhasil dihapus"
    };
}

export async function getDeployments(userId) {
    if (!userId) {
        throw new Error(
            "User ID wajib diisi"
        );
    }

    return await Deployment.find({
        userId,
        status: {
            $ne: "deleted"
        }
    }).sort({
        createdAt: -1
    });
}

export async function getDeployment({
    deploymentId,
    userId
}) {
    if (!deploymentId || !userId) {
        throw new Error(
            "Deployment ID dan User ID wajib diisi"
        );
    }

    const deployment =
        await Deployment.findOne({
            _id: deploymentId,
            userId,
            status: {
                $ne: "deleted"
            }
        });

    if (!deployment) {
        throw new Error(
            "Deployment tidak ditemukan"
        );
    }

    return deployment;
}

export function createUploadFile({
    name,
    data
}) {
    if (!name) {
        throw new Error(
            "Nama file wajib diisi"
        );
    }

    if (!data) {
        throw new Error(
            "Data file wajib diisi"
        );
    }

    return {
        file: name,

        data,

        sha: crypto
            .createHash("sha1")
            .update(data)
            .digest("hex")
    };
}

export function getAllowedDomains() {
    return [
        ...ALLOWED_DOMAINS
    ];
}

export function getProjectSlug(name) {
    return slugify(name);
}

export function getProjectCustomDomain(
    name,
    domain
) {
    validateDomain(domain);

    return getCustomDomain(
        slugify(name),
        domain
    );
}