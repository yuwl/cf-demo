import type { MessageRow, UserRow } from '../db/schema'
import type { PublicUser } from '../env'

export function toPublicUser(row: UserRow, origin: string): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarKey ? `${origin}/api/avatars/${row.id}` : null,
    emailVerified: row.emailVerified === 1,
    createdAt: row.createdAt,
  }
}

export interface PublicMessage {
  id: string
  content: string
  createdAt: number
  author: {
    id: string
    displayName: string
    avatarUrl: string | null
  }
}

export function toPublicMessage(row: MessageRow, author: UserRow, origin: string): PublicMessage {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    author: {
      id: author.id,
      displayName: author.displayName,
      avatarUrl: author.avatarKey ? `${origin}/api/avatars/${author.id}` : null,
    },
  }
}
