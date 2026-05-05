import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import pico from 'picocolors'
import COS from 'cos-nodejs-sdk-v5'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const log = {
    warn: (...msg) => console.log(pico.yellow('warn ' + msg.join(' '))),
    error: (...msg) => console.log(pico.red('error ' + msg.join(' ')))
}

const cos = new COS({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY
})

const BUCKET = 'books-1307473067'
const REGION = 'ap-hongkong'

function uploadToCOS(filePath) {
    const filename = path.basename(filePath)
    const key = 'comics/' + filename
    return new Promise((resolve, reject) => {
        cos.uploadFile({
            Bucket: BUCKET,
            Region: REGION,
            Key: key,
            FilePath: filePath,
            onProgress: (p) => {
                process.stdout.write('\r上传中 ' + Math.round(p.percent * 100) + '%')
            }
        }, (err, data) => {
            if (err) return reject(err)
            console.log('')
            resolve('https://' + BUCKET + '.cos.' + REGION + '.myqcloud.com/' + key)
        })
    })
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
            const link = await uploadToCOS(tmpPath)
            fs.unlinkSync(tmpPath)
            console.log(filename + ' 下载地址：' + link)
        } catch (error) {
            log.error('上传失败：' + error.message)
        }
    })

    return Promise.allSettled(tasks)
}

main()
