import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })

const prisma = new PrismaClient()

// 站点默认配置：只在缺失时写入，不覆盖后台已改动的值
const DEFAULT_CONFIG: Array<{ key: string; value: unknown }> = [
  { key: 'site.name', value: '清浅 Wiki' },
  { key: 'site.registrationOpen', value: true },
  { key: 'storage.driver', value: 'local' },
]

async function main() {
  for (const item of DEFAULT_CONFIG) {
    await prisma.siteConfig.upsert({
      where: { key: item.key },
      update: {},
      create: { key: item.key, value: item.value as never },
    })
  }
  console.log(`Seeded ${DEFAULT_CONFIG.length} site config keys`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
