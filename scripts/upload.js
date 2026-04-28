import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const ROOT = path.resolve('./comics')

// 压缩（调用系统 zip）
function zipFolder(sourceDir, outPath) {
    if (fs.existsSync(outPath)) {
        console.log('已存在zip，跳过压缩：', outPath)
        return
    }

    console.log('压缩中：', sourceDir)

    // -r 递归
    // -q 安静模式
    execSync(`zip -r -q "${outPath}" "${path.basename(sourceDir)}"`, {
        cwd: path.dirname(sourceDir),
        stdio: 'inherit'
    })
}

// 上传（transfer.sh）
async function upload(filePath) {
    const filename = path.basename(filePath)

    console.log('上传中：', filename)

    const stream = fs.createReadStream(filePath)

    const resp = await fetch(
        `https://transfer.sh/${encodeURIComponent(filename)}`,
        {
            method: 'PUT',
            body: stream,
            duplex: 'half', // ✅ 必加
            headers: {
                'Content-Type': 'application/zip'
            }
        }
    )

    if (!resp.ok) {
        throw new Error('上传失败: ' + resp.status)
    }

    const text = await resp.text()
    return text.trim()
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

        const zipPath = comicDir + '.zip'

        try {
            zipFolder(comicDir, zipPath)
        } catch (e) {
            console.log('压缩失败：', e.message)
            continue
        }

        try {
            const link = await upload(zipPath)
            console.log('下载地址：', link)
        } catch (e) {
            console.log('上传失败：', e.message)
        }
    }
}

main()
