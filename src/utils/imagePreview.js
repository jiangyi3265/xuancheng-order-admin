import { shallowRef } from 'vue'

export const previewImage = shallowRef(null)

export function imageEntries(files = [], context = '') {
  return files.filter(file => file?.type === 'image' && file.url)
    .map(file => ({file, url: file.url, name: file.name || '图片预览', context}))
}

export function issueGallery(issues) {
  return issues.flatMap(issue => {
    const context = '问题 #' + issue.id
    return [
      ...imageEntries(issue.attachments || [], context),
      ...(issue.updates || []).flatMap(update => imageEntries(update.attachments || [], context + ' · 补充说明'))
    ]
  })
}

export function openImage(url, name, file, gallery = []) {
  if (!url) return
  const index = gallery.findIndex(entry => entry.file === file)
  previewImage.value = index < 0 ? {url, name: name || '图片预览', file} : {...gallery[index], gallery, index}
}

export function moveImage(offset) {
  const current = previewImage.value
  if (!current?.gallery) return
  const index = current.index + offset
  const target = current.gallery[index]
  if (target) previewImage.value = {...target, gallery:current.gallery, index}
}

export function openCover(event, label) {
  const image = event.currentTarget.querySelector('img')
  if (image) return openImage(image.currentSrc || image.src, label)
  const artwork = event.currentTarget.querySelector('.board-artwork')
  if (!artwork) return
  const { backgroundImage, backgroundSize, backgroundPosition, aspectRatio } = artwork.style
  previewImage.value = { name: label, crop: { backgroundImage, backgroundSize, backgroundPosition, aspectRatio, "--image-ratio": aspectRatio } }
}
