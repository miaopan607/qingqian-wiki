import type { Prisma } from '@prisma/client'

import { resolveAssetUrls } from '../services/media.service'

// 结构化输入类型：只声明 transformer 真正读取的字段
type AssetUrlSource = {
  driver: 'local' | 's3'
  storageKey: string
  displayKey: string | null
  thumbKey: string | null
}

type AssetFields = AssetUrlSource & {
  width: number
  height: number
  blurhash: string | null
}

export type GalleryInteraction = { liked: boolean; favorited: boolean }

export type ImagePayload = { id: string; sortOrder: number; asset: AssetFields }

export type GalleryListPayload = {
  id: string
  title: string
  description: string
  status: 'draft' | 'published'
  likesCount: number
  favoritesCount: number
  publishedAt: Date | null
  createdAt: Date
  images: Array<{ asset: AssetFields }>
  _count: { images: number }
  author: { displayName: string }
}

export type GalleryDetailPayload = {
  id: string
  title: string
  description: string
  status: 'draft' | 'published'
  likesCount: number
  favoritesCount: number
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  images: ImagePayload[]
  author: { uid: string; displayName: string; avatarAsset: AssetFields | null }
}

export type KeycapListPayload = {
  id: string
  seq: number
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
  images: Array<{ asset: AssetFields }>
  _count: { images: number }
}

export type KeycapDetailPayload = {
  id: string
  seq: number
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
  images: ImagePayload[]
}

export type UserPayload = {
  uid: string
  email: string
  displayName: string
  bio: string
  role: 'user' | 'admin' | 'super_admin'
  status: 'active' | 'banned'
  banReason: string | null
  bannedAt: Date | null
  createdAt: Date
  avatarAsset: AssetUrlSource | null
}

export const GALLERY_LIST_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' }, take: 1, include: { asset: true } },
  _count: { select: { images: true } },
  author: { select: { displayName: true } },
} satisfies Prisma.GalleryInclude

export const GALLERY_DETAIL_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' }, include: { asset: true } },
  author: { select: { uid: true, displayName: true, avatarAsset: true } },
} satisfies Prisma.GalleryInclude

export const KEYCAP_LIST_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' }, take: 1, include: { asset: true } },
  _count: { select: { images: true } },
} satisfies Prisma.KeycapInclude

export const KEYCAP_DETAIL_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' }, include: { asset: true } },
} satisfies Prisma.KeycapInclude

function toImagePayload(image: ImagePayload) {
  return {
    id: image.id,
    sortOrder: image.sortOrder,
    ...resolveAssetUrls(image.asset),
    width: image.asset.width,
    height: image.asset.height,
    blurhash: image.asset.blurhash,
  }
}

function toCoverPayload(images: Array<{ asset: AssetFields }>) {
  const asset = images[0]?.asset
  if (!asset) return null

  return {
    ...resolveAssetUrls(asset),
    width: asset.width,
    height: asset.height,
    blurhash: asset.blurhash,
  }
}

export function toGalleryListItem(gallery: GalleryListPayload, interaction?: GalleryInteraction) {
  return {
    id: gallery.id,
    title: gallery.title,
    description: gallery.description,
    status: gallery.status,
    imagesCount: gallery._count.images,
    cover: toCoverPayload(gallery.images),
    likesCount: gallery.likesCount,
    favoritesCount: gallery.favoritesCount,
    liked: interaction?.liked ?? false,
    favorited: interaction?.favorited ?? false,
    authorName: gallery.author.displayName,
    publishedAt: gallery.publishedAt ? gallery.publishedAt.toISOString() : null,
    createdAt: gallery.createdAt.toISOString(),
  }
}

export function toGalleryDetail(gallery: GalleryDetailPayload, interaction?: GalleryInteraction) {
  return {
    id: gallery.id,
    title: gallery.title,
    description: gallery.description,
    status: gallery.status,
    images: gallery.images.map((image) => toImagePayload(image)),
    likesCount: gallery.likesCount,
    favoritesCount: gallery.favoritesCount,
    liked: interaction?.liked ?? false,
    favorited: interaction?.favorited ?? false,
    author: {
      uid: gallery.author.uid,
      displayName: gallery.author.displayName,
      avatarUrl: gallery.author.avatarAsset
        ? resolveAssetUrls(gallery.author.avatarAsset).thumbUrl
        : null,
    },
    publishedAt: gallery.publishedAt ? gallery.publishedAt.toISOString() : null,
    createdAt: gallery.createdAt.toISOString(),
    updatedAt: gallery.updatedAt.toISOString(),
  }
}

export function toKeycapListItem(keycap: KeycapListPayload) {
  return {
    id: keycap.id,
    seq: keycap.seq,
    name: keycap.name,
    description: keycap.description,
    imagesCount: keycap._count.images,
    cover: toCoverPayload(keycap.images),
    createdAt: keycap.createdAt.toISOString(),
    updatedAt: keycap.updatedAt.toISOString(),
  }
}

export function toKeycapDetail(keycap: KeycapDetailPayload) {
  return {
    id: keycap.id,
    seq: keycap.seq,
    name: keycap.name,
    description: keycap.description,
    images: keycap.images.map((image) => toImagePayload(image)),
    createdAt: keycap.createdAt.toISOString(),
    updatedAt: keycap.updatedAt.toISOString(),
  }
}

export function toUserResponse(user: UserPayload, extra?: { galleriesCount: number }) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    role: user.role,
    status: user.status,
    banReason: user.banReason,
    bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
    avatarUrl: user.avatarAsset ? resolveAssetUrls(user.avatarAsset).thumbUrl : null,
    createdAt: user.createdAt.toISOString(),
    ...(extra ? { galleriesCount: extra.galleriesCount } : {}),
  }
}
