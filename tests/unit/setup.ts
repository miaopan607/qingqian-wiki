import os from 'os'
import path from 'path'

// 单测统一把上传目录指向临时目录，避免污染仓库
process.env.NODE_ENV = 'test'
process.env.UPLOADS_PATH = path.join(os.tmpdir(), 'qingqian-wiki-test-uploads')
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_replace_with_random_string'
