import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import axios from 'axios'
import archiver from 'archiver'

const ROOT = path.resolve('./comics')
const CONCURRENCY = 5
const RETRIES = 5

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

// 断点续传下载
async function downloadFile(url, filepath) {
    let start = 0

    if (fs.existsSync(filepath)) {
        start = fs.statSync(filepath).size
    }

    for (let i = 0; i < RETRIES; i++) {
        try {
            const resp = await axios.get(url, {
                responseType: 'stream',
                headers: start ? { Range: `bytes=${start}-` } : {},
                timeout: 30000
            })

            const writer = fs.createWriteStream(filepath, {
                flags: start ? 'a' : 'w'
            })

            resp.data.pipe(writer)

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve)
                writer.on('error', reject)
            })

            return
        } catch (e) {
            console.log(`下载失败重试(${i + 1})`, url)
            await sleep(2000)
        }
    }

    throw new Error('下载失败: ' + url)
}

// 并发控制
async function runWithLimit(tasks, limit) {
    const results = []
    const pool = []

    for (const task of tasks) {
        const p = task()
        results.push(p)

        const e = p.then(() => pool.splice(pool.indexOf(e), 1))
        pool.push(e)

        if (pool.length >= limit) {
            await Promise.race(pool)
        }
    }

    return Promise.all(results)
}

// 压缩文件夹（流式）
function zipFolder(sourceDir, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath)
        const archive = archiver('zip', { zlib: { level: 9 } })

        output.on('close', resolve)
        archive.on('error', reject)

        archive.pipe(output)
        archive.directory(sourceDir, false)
        archive.finalize()
    })
}

// 上传到 transfer.sh
async function upload(filePath) {
    const stream = fs.createReadStream(filePath)
    const filename = path.basename(filePath)

    const resp = await axios.put(
        `https://transfer.sh/${encodeURIComponent(filename)}`,
        stream,
        {
            headers: { 'Content-Type': 'application/zip' },
            maxBodyLength: Infinity
        }
    )

    return resp.data
}

// 主流程
async function main() {
    if (!fs.existsSync(ROOT)) {
        console.log('没有 comics 文件夹')
        return
    }

    const comics = await fsp.readdir(ROOT)

    for (const comic of comics) {
        const comicDir = path.join(ROOT, comic)
        const stat = await fsp.stat(comicDir)

        if (!stat.isDirectory()) continue

        console.log('\n处理漫画：', comic)

        // 这里假设你已有图片，不再重新下载
        // 如果你有图片URL列表，可以在这里插入下载逻辑

        const zipPath = comicDir + '.zip'

        console.log('压缩中...')
        await zipFolder(comicDir, zipPath)

        console.log('上传中...')
        try {
            const link = await upload(zipPath)
            console.log('下载链接：', link)
        } catch (e) {
            console.log('上传失败：', e.message)
        }
    }
}

main()
