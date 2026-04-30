import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import pico from 'picocolors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const log = {
    info: (...msg) => console.log(pico.cyan('info'), ...msg),
    warn: (...msg) => console.log(pico.yellow('warn ' + msg.join(' '))),
    error: (...msg) => console.log(pico.red('error ' + msg.join(' ')))
}

const TRANSFER_HOST = 'transfer' + '.' + 'sh'
const GOFILE_API = 'https://api' + '.' + 'gofile' + '.' + 'io'

async function uploadTransfer(filePath) {
    const filename = path.basename(filePath)
    const stream = fs.createReadStream(filePath)
    const url = 'https://' + TRANSFER_HOST + '/' + encodeURIComponent(filename)
    const resp = await fetch(url, {
        method: 'PUT',
        body: stream,
        duplex: 'half',
        headers: { 'Content-Type': 'application/zip' }
    })
    if (!resp.ok) throw new Error('transfer失败 ' + resp.status)
    return (await resp.text()).trim()
}

async function uploadGoFile(filePath) {
    const filename = path.basename(filePath)
    const serverResp = await fetch(GOFILE_API + '/getServer')
    const serverData = await serverResp.json()
    const server = serverData.data.server
    const form = new FormData()
    form.append('file', new Blob([fs.readFileSync(filePath)]), filename)
    const uploadResp = await fetch(
        'https://' + server + '.gofile.io/uploadFile',
        { method: 'POST', body: form }
    )
    const data = await uploadResp.json()
    if (data.status !== 'ok') throw new Error('gofile失败')
    return data.data.downloadPage
}

async function upload(filePath) {
    try {
        console.log('尝试 transfer...')
        return await uploadTransfer(filePath)
    } catch (e) {
        console.log('transfer 失败：' + e.message + '，切换 GoFile')
    }
    try {
        return await uploadGoFile(filePath)
    } catch (e) {
        console.log('GoFile 失败：' + e.message)
    }
    throw new Error('所有上传方式失败')
}

async function main() {
    let root = path.resolve(__dirname, '../comics-zip')
    if (!fs.existsSync(root)) {
        root = path.resolve(__dirname, '../comics')
        if (!fs.existsSync(root)) {
            log.warn('没有发现已下载的漫画')
            return
        }
    }

    const comics = await fs.promises.readdir(root)
    const tasks = comics.map(async (comic) => {
        try {
            const zip = new AdmZip()
            zip.addLocalFolder(path.join(root, comic))
            const zipBuffer = zip.toBuffer()
            const filename = comic + '.zip'
            const tmpPath = path.resolve(__dirname, '../' + filename)
            fs.writeFileSync(tmpPath, zipBuffer)
            const link = await upload(tmpPath)
            fs.unlinkSync(tmpPath)
            console.log(filename + ' 下载地址：' + link)
        } catch (error) {
            log.error('上传失败：' + error.message)
        }
    })

    return Promise.allSettled(tasks)
}

main()
