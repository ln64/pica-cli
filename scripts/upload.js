import fs from 'fs'
import path from 'path'

// 上传到 transfer.sh
async function uploadTransfer(filePath) {
    const filename = path.basename(filePath)

    const stream = fs.createReadStream(filePath)

    const resp = await fetch(
        `https://transfer.sh/${encodeURIComponent(filename)}`,
        {
            method: 'PUT',
            body: stream,
            duplex: 'half',
            headers: {
                'Content-Type': 'application/zip'
            }
        }
    )

    if (!resp.ok) throw new Error('transfer.sh失败')

    return (await resp.text()).trim()
}

// 上传到 GoFile（备用）
async function uploadGoFile(filePath) {
    const filename = path.basename(filePath)

    // 获取服务器
    const serverResp = await fetch('https://api.gofile.io/getServer')
    const serverData = await serverResp.json()

    const server = serverData.data.server

    const form = new FormData()
    form.append('file', new Blob([fs.readFileSync(filePath)]), filename)

    const uploadResp = await fetch(
        `https://${server}.gofile.io/uploadFile`,
        {
            method: 'POST',
            body: form
        }
    )

    const data = await uploadResp.json()

    if (data.status !== 'ok') {
        throw new Error('gofile失败')
    }

    return data.data.downloadPage
}

// 总上传（自动切换）
async function upload(filePath) {
    for (let i = 0; i < 2; i++) {
        try {
            console.log('尝试 transfer.sh...')
            return await uploadTransfer(filePath)
        } catch (e) {
            console.log('transfer.sh 失败，切换 GoFile')
        }

        try {
            return await uploadGoFile(filePath)
        } catch (e) {
            console.log('GoFile 失败，重试...')
        }
    }

    throw new Error('所有上传方式失败')
}
