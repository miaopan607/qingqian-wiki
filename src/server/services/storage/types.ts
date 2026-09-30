export type StorageDriverId = 'local' | 's3'

export interface StorageDriver {
  readonly id: StorageDriverId
  /** key 为不含前缀的对象路径，由各驱动自行处理存储位置 */
  put(key: string, body: Buffer, contentType: string): Promise<void>
  delete(key: string): Promise<void>
  url(key: string): string
}
