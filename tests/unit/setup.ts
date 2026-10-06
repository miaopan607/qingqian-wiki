import os from 'os'
import path from 'path'

// 单测统一把上传目录指向临时目录，避免污染仓库
process.env.NODE_ENV = 'test'
// 显式留空，避免ORM加载本地.env时重新带入开发活动时钟。
process.env.CHECK_IN_DEV_TIME = ''
process.env.UPLOADS_PATH = path.join(os.tmpdir(), 'qingqian-wiki-test-uploads')
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_replace_with_random_string'
