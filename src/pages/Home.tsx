import { ImageIcon, Keyboard } from 'lucide-react'

import { GalleryCard } from '../components/gallery/GalleryCard'
import { KeycapCard } from '../components/keycap/KeycapCard'
import { EmptyState, LinkButton, Masonry, Skeleton } from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { apiGet } from '../lib/apiClient'
import type { GalleryListResponse, KeycapListResponse } from '../types/api'

const PREVIEW_SIZE = 6
const SKELETON_HEIGHTS = ['h-[240px]', 'h-[320px]', 'h-[280px]', 'h-[360px]']

export default function Home() {
  const { config } = useSiteConfig()

  const galleries = useAsyncData(() =>
    apiGet<GalleryListResponse>('/api/galleries', { page: 1, pageSize: PREVIEW_SIZE })
  )
  const keycaps = useAsyncData(() =>
    apiGet<KeycapListResponse>('/api/keycaps', { page: 1, pageSize: PREVIEW_SIZE })
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8">
      <section className="flex flex-col items-center gap-5 py-16 text-center md:py-24">
        <h1 className="font-serif text-4xl tracking-[0.2em] text-ink md:text-5xl">{config.name}</h1>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <LinkButton to="/gallery" size="lg" leftIcon={<ImageIcon className="size-4" />}>
            浏览美图
          </LinkButton>
          <LinkButton
            to="/keycaps"
            size="lg"
            variant="outline"
            leftIcon={<Keyboard className="size-4" />}
          >
            查看键帽
          </LinkButton>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl text-ink">最新美图</h2>
          <LinkButton to="/gallery" variant="ghost" size="sm">
            全部 →
          </LinkButton>
        </div>
        {galleries.loading ? (
          <Masonry className="[--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className={SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]} />
            ))}
          </Masonry>
        ) : galleries.data && galleries.data.items.length > 0 ? (
          <Masonry className="[--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] gap-4">
            {galleries.data.items.map((gallery, index) => (
              <GalleryCard key={gallery.id} gallery={gallery} priority={index < 3} />
            ))}
          </Masonry>
        ) : (
          <EmptyState icon={ImageIcon} title="还没有美图" />
        )}
      </section>

      <section className="mt-16 flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl text-ink">最新键帽</h2>
          <LinkButton to="/keycaps" variant="ghost" size="sm">
            全部 →
          </LinkButton>
        </div>
        {keycaps.loading ? (
          <Masonry className="[--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className={SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]} />
            ))}
          </Masonry>
        ) : keycaps.data && keycaps.data.items.length > 0 ? (
          <Masonry className="[--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] gap-4">
            {keycaps.data.items.map((keycap, index) => (
              <KeycapCard key={keycap.id} keycap={keycap} priority={index < 3} />
            ))}
          </Masonry>
        ) : (
          <EmptyState icon={Keyboard} title="还没有键帽记录" />
        )}
      </section>
    </div>
  )
}
