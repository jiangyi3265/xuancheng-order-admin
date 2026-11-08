import { shallowRef } from 'vue'

export const previewImage = shallowRef(null)

export function openImage(url, name, file) {
  if (url) previewImage.value = { url, name: name || '图片预览', file }
}

export function openCover(event, label) {
  const image = event.currentTarget.querySelector('img')
  if (image) return openImage(image.currentSrc || image.src, label)
  const artwork = event.currentTarget.querySelector('.board-artwork')
  if (!artwork) return
  const { backgroundImage, backgroundSize, backgroundPosition, aspectRatio } = artwork.style
  previewImage.value = { name: label, crop: { backgroundImage, backgroundSize, backgroundPosition, aspectRatio, "--image-ratio": aspectRatio } }
}
