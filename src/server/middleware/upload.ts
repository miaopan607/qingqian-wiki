import multer from 'multer'

import {
  ALLOWED_IMAGE_EXTENSIONS,
  isAllowedImageFile,
  UPLOAD_MAX_FILE_SIZE_BYTES,
} from '../services/image.service'

// 图片直接进内存，交给 sharp 处理后写入存储驱动
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImageFile(file)) {
      cb(new Error(`仅支持 ${ALLOWED_IMAGE_EXTENSIONS.join('、')} 图片上传`))
      return
    }
    cb(null, true)
  },
})
