import { Images } from 'lucide-react'
import { Link } from 'react-router-dom'

import { SmartImage } from '../SmartImage'
import { Badge, Panel, cn } from '../ui'
import type { KeycapItem } from '../../types/entities'

type KeycapCardProps = {
  keycap: KeycapItem
  priority?: boolean
  className?: string
}

export function KeycapCard({ keycap, priority, className }: KeycapCardProps) {
  return (
    <Panel
      className={cn('group overflow-hidden p-0 transition-shadow hover:shadow-lg', className)}
      padded={false}
    >
      <Link to={`/keycaps/${keycap.id}`} className="block">
        <SmartImage
          src={keycap.cover?.thumbUrl}
          blurhash={keycap.cover?.blurhash}
          width={keycap.cover?.width}
          height={keycap.cover?.height}
          alt={keycap.name}
          priority={priority}
          wrapperClassName="aspect-[4/3] w-full"
          className="transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Badge tone="accent">第 {keycap.seq} 团</Badge>
            <h3 className="line-clamp-1 text-base text-ink">{keycap.name}</h3>
          </div>
          {keycap.description && (
            <p className="line-clamp-2 text-sm text-ink-muted">{keycap.description}</p>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <Images className="size-3.5" aria-hidden="true" />
            {keycap.imagesCount} 张
          </span>
        </div>
      </Link>
    </Panel>
  )
}
