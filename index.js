import fs from 'fs'
import path from 'path'
import pino from 'pino'
import chalk from 'chalk'
import readline from 'readline'
import NodeCache from 'node-cache'
import qrcode from 'qrcode'

import * as baileys from '@whiskeysockets/baileys'

import { config } from './config.js'
import { sleep } from './system/utils.js'
import { loadPlugins } from './system/loader.js'
import { createHandler } from './system/handler.js'

const makeWASocket =
    baileys.default ||
    baileys.makeWASocket

const {
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    jidDecode,
    fetchLatestBaileysVersion
} = baileys

const SESSION_DIR =
    path.resolve('./session')

const msgRetryCounterCache =
    new NodeCache()

const rl =
    readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

function question(text) {
    return new Promise(resolve => {
        rl.question(
            text,
            answer => resolve(
                answer.trim()
            )
        )
    })
}

function decodeJid(jid = '') {
    if (!jid) return jid

    if (jid.includes(':')) {
        try {
            const decoded =
                jidDecode(jid)

            if (
                decoded?.user &&
                decoded?.server
            ) {
                return `${decoded.user}@${decoded.server}`
            }
        } catch {}
    }

    return jid
}

function banner() {
    console.clear()

    console.log(
        chalk.cyan(`
╭────────────────────────────╮
│       REYCLOUD BOT          │
│          ESM v1             │
╰────────────────────────────╯
`)
    )
}

async function chooseLogin() {
    console.log(
        chalk.white('1. QR Code')
    )

    console.log(
        chalk.white('2. Pairing Code')
    )

    let choice =
        await question(
            chalk.cyan('\nPilih login [1/2]: ')
        )

    if (
        choice !== '1' &&
        choice !== '2'
    ) {
        choice = '1'
    }

    return choice
}

async function startBot() {
    banner()

    if (!makeWASocket) {
        throw new Error(
            'makeWASocket tidak ditemukan dari levvleys.'
        )
    }

    fs.mkdirSync(
        SESSION_DIR,
        {
            recursive: true
        }
    )

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            SESSION_DIR
        )

    let version

    try {
        if (
            typeof fetchLatestBaileysVersion ===
            'function'
        ) {
            const result =
                await fetchLatestBaileysVersion()

            version =
                result?.version
        }
    } catch (error) {
        console.log(
            chalk.yellow(
                '[BAILEYS] Gagal mengambil versi terbaru.'
            )
        )
    }

    const logger =
        pino({
            level: 'silent'
        })

    const signalStore =
        typeof makeCacheableSignalKeyStore ===
        'function'
            ? makeCacheableSignalKeyStore(
                state.keys,
                logger,
                msgRetryCounterCache
            )
            : state.keys

    const sock =
        makeWASocket({
            ...(version
                ? { version }
                : {}),

            logger,

            printQRInTerminal: false,

            browser: [
                'ReyCloud',
                'Chrome',
                '1.0.0'
            ],

            auth: {
                creds: state.creds,

                keys: signalStore
            },

            msgRetryCounterCache,

            generateHighQualityLinkPreview:
                true,

            syncFullHistory: false,

            markOnlineOnConnect: false,

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs:
                undefined
        })

    sock.decodeJid =
        decodeJid

    sock.public = true

    sock.ev.on(
        'creds.update',
        saveCreds
    )

    const plugins =
        await loadPlugins()

    console.log(
        chalk.green(
            `[PLUGIN] ${plugins.length} plugin aktif.`
        )
    )

    const handler =
        createHandler(
            sock,
            plugins
        )

    sock.ev.on(
        'messages.upsert',
        async ({ messages }) => {
            for (
                const message of messages
            ) {
                await handler(message)
            }
        }
    )

    sock.ev.on(
        'connection.update',
        async update => {
            const {
                connection,
                lastDisconnect,
                qr
            } = update

            if (
                connection === 'connecting'
            ) {
                console.log(
                    chalk.yellow(
                        '[WA] Connecting...'
                    )
                )
            }

            if (
                connection === 'open'
            ) {
                console.log(
                    chalk.green(
                        '\n[WA] Connected!'
                    )
                )

                console.log(
                    chalk.cyan(
                        `[WA] Bot: ${sock.user?.name || 'ReyCloud'}`
                    )
                )

                console.log(
                    chalk.cyan(
                        `[WA] Number: ${sock.user?.id || '-'}`
                    )
                )
            }

            if (
                qr &&
                !state.creds.registered
            ) {
                console.log(
                    chalk.yellow(
                        '\n[WA] Scan QR berikut:\n'
                    )
                )

                try {
                    const terminalQR =
                        await qrcode.toString(
                            qr,
                            {
                                type: 'terminal',
                                small: true
                            }
                        )

                    console.log(
                        terminalQR
                    )
                } catch (error) {
                    console.error(
                        '[QR ERROR]',
                        error
                    )
                }
            }

            if (
                connection === 'close'
            ) {
                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode

                const loggedOut =
                    statusCode ===
                    DisconnectReason.loggedOut

                const badSession =
                    statusCode ===
                    DisconnectReason.badSession

                console.log(
                    chalk.red(
                        `[WA] Connection closed: ${statusCode || 'unknown'}`
                    )
                )

                if (
                    loggedOut ||
                    badSession
                ) {
                    console.log(
                        chalk.red(
                            '[WA] Session tidak dapat digunakan lagi.'
                        )
                    )

                    return
                }

                if (
                    config.reconnect.enabled
                ) {
                    console.log(
                        chalk.yellow(
                            `[WA] Reconnecting dalam ${config.reconnect.delay / 1000}s...`
                        )
                    )

                    await sleep(
                        config.reconnect.delay
                    )

                    startBot()
                }
            }
        }
    )

    if (
        !state.creds.registered
    ) {
        const method =
            await chooseLogin()

        if (
            method === '2'
        ) {
            let phone =
                config.pairing.phoneNumber

            if (!phone) {
                phone =
                    await question(
                        '\nMasukkan nomor WhatsApp: '
                    )
            }

            phone =
                phone.replace(
                    /\D/g,
                    ''
                )

            if (!phone) {
                console.log(
                    chalk.red(
                        'Nomor tidak valid.'
                    )
                )

                return
            }

            await sleep(1500)

            try {
                const code =
                    await sock.requestPairingCode(
                        phone,
                        config.pairing.customCode
                    )

                console.log(
                    chalk.green(
                        '\n╭──────────────────────╮'
                    )
                )

                console.log(
                    chalk.green(
                        `│ Pairing: ${code}`
                    )
                )

                console.log(
                    chalk.green(
                        '╰──────────────────────╯'
                    )
                )

            } catch (error) {
                console.error(
                    chalk.red(
                        '[PAIRING ERROR]'
                    ),
                    error
                )
            }
        }
    }
}

startBot().catch(error => {
    console.error(
        chalk.red(
            '[FATAL ERROR]'
        ),
        error
    )

    process.exit(1)
})