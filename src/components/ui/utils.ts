import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// 合并外部 className 与内部样式，后写样式优先
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
