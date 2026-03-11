import { eq, and, or, sql, desc, notInArray, isNull, inArray, gte, lte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cards, photos, votes, comments, favorites, feedbacks, moderationRecords, InsertCard, InsertPhoto, InsertVote, InsertComment, InsertFavorite, InsertFeedback, InsertModerationRecord, Card, Photo, Comment, ModerationRecord } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
const MODERATION_PENDING_TIMEOUT_MS = 10 * 60 * 1000;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (user.nameModerationStatus !== undefined) {
      values.nameModerationStatus = user.nameModerationStatus;
      updateSet.nameModerationStatus = user.nameModerationStatus;
    }
    if (user.avatarModerationStatus !== undefined) {
      values.avatarModerationStatus = user.avatarModerationStatus;
      updateSet.avatarModerationStatus = user.avatarModerationStatus;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  await expireTimedOutPendingModeration();

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await expireTimedOutPendingModeration();
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

const PHONE_OPENID_PREFIX = "phone:";
export function phoneToOpenId(phone: string): string {
  return PHONE_OPENID_PREFIX + phone.trim();
}

export async function createUserWithPhone(phone: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = phoneToOpenId(phone);
  const now = new Date();
  await db.insert(users).values({
    openId,
    phone: phone.trim(),
    passwordHash,
    lastSignedIn: now,
  });
  return getUserByOpenId(openId);
}

/** Create user by phone only (for verification-code login; no password). */
export async function createUserByPhone(phone: string, hermitUserUUID?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = phoneToOpenId(phone);
  const now = new Date();
  await db.insert(users).values({
    openId,
    phone: phone.trim(),
    hermitUserUUID,
    lastSignedIn: now,
  });
  return getUserByOpenId(openId);
}

export async function updateUserAvatar(userId: number, avatarUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
}

export async function updateUserName(userId: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

export async function updateUserAvatarModerationStatus(userId: number, status: "approved" | "pending" | "rejected"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarModerationStatus: status }).where(eq(users.id, userId));
}

export async function updateUserNameModerationStatus(userId: number, status: "approved" | "pending" | "rejected"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ nameModerationStatus: status }).where(eq(users.id, userId));
}

// ==================== Card Operations ====================

export async function createCard(data: InsertCard): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(cards).values(data);
  return Number(result[0].insertId);
}

export async function getCardById(
  cardId: number,
  options?: { includeUnapproved?: boolean }
): Promise<Card | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await expireTimedOutPendingModeration();

  const whereClause = options?.includeUnapproved
    ? eq(cards.id, cardId)
    : and(eq(cards.id, cardId), eq(cards.moderationStatus, "approved"));

  const result = await db.select().from(cards).where(whereClause).limit(1);
  return result[0];
}

export async function getCardsByUserId(userId: number): Promise<Card[]> {
  const db = await getDb();
  if (!db) return [];
  await expireTimedOutPendingModeration();
  
  return db.select().from(cards).where(eq(cards.userId, userId)).orderBy(desc(cards.createdAt));
}

export async function updateCardVotes(cardId: number, totalVotes: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(cards).set({ totalVotes }).where(eq(cards.id, cardId));
}

export async function updateCardModerationStatus(cardId: number, status: "approved" | "pending" | "rejected"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cards).set({ moderationStatus: status }).where(eq(cards.id, cardId));
}

/** Delete a user account and all their associated data. */
export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all cards the user owns (with their photos, votes, comments, favorites)
  const userCards = await db.select({ id: cards.id }).from(cards).where(eq(cards.userId, userId));
  for (const card of userCards) {
    await db.delete(votes).where(eq(votes.cardId, card.id));
    await db.delete(comments).where(eq(comments.cardId, card.id));
    await db.delete(favorites).where(eq(favorites.cardId, card.id));
    await db.delete(photos).where(eq(photos.cardId, card.id));
    await db.delete(cards).where(eq(cards.id, card.id));
  }

  // Delete user's votes, comments, favorites on other cards
  await db.delete(votes).where(eq(votes.userId, userId));
  await db.delete(comments).where(eq(comments.userId, userId));
  await db.delete(favorites).where(eq(favorites.userId, userId));
  await db.delete(feedbacks).where(eq(feedbacks.userId, userId));
  await db.delete(moderationRecords).where(eq(moderationRecords.moderatorUserId, userId));

  await db.delete(users).where(eq(users.id, userId));
}

/** Delete a card and all related data. Only allowed for card owner (userId). */
export async function deleteCard(cardId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const card = await getCardById(cardId, { includeUnapproved: true });
  if (!card || card.userId !== userId) return false;

  await db.delete(votes).where(eq(votes.cardId, cardId));
  await db.delete(comments).where(eq(comments.cardId, cardId));
  await db.delete(favorites).where(eq(favorites.cardId, cardId));
  await db.delete(photos).where(eq(photos.cardId, cardId));
  await db.delete(cards).where(eq(cards.id, cardId));
  return true;
}

/** Update a card's title and/or description. Only allowed for card owner (userId). */
export async function updateCard(
  cardId: number,
  userId: number,
  data: { title?: string | null; description?: string | null }
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const card = await getCardById(cardId, { includeUnapproved: true });
  if (!card || card.userId !== userId) return false;

  await db.update(cards).set(data).where(and(eq(cards.id, cardId), eq(cards.userId, userId)));
  return true;
}

// ==================== Photo Operations ====================

export async function createPhotos(data: InsertPhoto[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(photos).values(data);
}

export async function getPhotosByCardId(
  cardId: number,
  options?: { includeUnapproved?: boolean }
): Promise<Photo[]> {
  const db = await getDb();
  if (!db) return [];

  await expireTimedOutPendingModeration();

  const whereClause = options?.includeUnapproved
    ? eq(photos.cardId, cardId)
    : and(eq(photos.cardId, cardId), eq(photos.moderationStatus, "approved"));

  return db
    .select()
    .from(photos)
    .where(whereClause)
    .orderBy(photos.photoIndex);
}

export async function updatePhotoModerationStatus(photoId: number, status: "approved" | "pending" | "rejected"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(photos).set({ moderationStatus: status }).where(eq(photos.id, photoId));
}

export async function getPhotoById(photoId: number): Promise<Photo | null> {
  const db = await getDb();
  if (!db) return null;
  await expireTimedOutPendingModeration();
  const result = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  return result[0] ?? null;
}

export async function incrementPhotoVoteCount(photoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(photos).set({ voteCount: sql`${photos.voteCount} + 1` }).where(eq(photos.id, photoId));
}

// ==================== Vote Operations ====================

export async function createVote(data: InsertVote): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(votes).values(data);
  return Number(result[0].insertId);
}

export async function hasVotedOnCard(userId: number, cardId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db.select().from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.cardId, cardId)))
    .limit(1);
  
  return result.length > 0;
}

/** Returns true if the user has cast at least one vote ever. */
export async function hasAnyVote(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.select({ id: votes.id }).from(votes)
    .where(eq(votes.userId, userId))
    .limit(1);

  return result.length > 0;
}

export async function getRandomAvailableCard(userId?: number): Promise<Card | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await expireTimedOutPendingModeration();

  const conditions = [eq(cards.moderationStatus, "approved")];

  if (userId != null) {
    const votedRows = await db.select({ cardId: votes.cardId }).from(votes).where(eq(votes.userId, userId));
    const votedCardIds = votedRows.map((r) => r.cardId);
    if (votedCardIds.length > 0) {
      conditions.push(notInArray(cards.id, votedCardIds));
    }
    // 允许用户刷到自己发布的投票，并可为自己投一票（不排除 cards.userId === userId）
  }

  const baseQuery = db.select().from(cards);
  const result = await (conditions.length > 0
    ? baseQuery.where(and(...conditions))
    : baseQuery
  )
    .orderBy(sql`RAND()`)
    .limit(1);

  return result[0];
}

/** Get multiple random cards for voting (for preloading). Only excludes session-queued ids. */
export async function getRandomAvailableCards(
  limit: number,
  excludeCardIds: number[] = [],
  _userId?: number
): Promise<Card[]> {
  const db = await getDb();
  if (!db) return [];

  await expireTimedOutPendingModeration();

  const baseWhere = excludeCardIds.length > 0
    ? and(notInArray(cards.id, excludeCardIds), eq(cards.moderationStatus, "approved"))
    : eq(cards.moderationStatus, "approved");

  const result = await db.select().from(cards).where(baseWhere)
    .orderBy(sql`RAND()`)
    .limit(limit);

  return result;
}

// ==================== Comment Operations ====================

/** Build a display name for a commenter. Prefers real name, then masked phone, then generic fallback. */
export function buildUserName(user: { name: string | null; phone: string | null } | null | undefined): string {
  if (user?.name?.trim()) return user.name.trim();
  if (user?.phone) {
    const p = user.phone;
    if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(7)}`;
    return p;
  }
  return "用户";
}

export async function getUserDisplayProfile(userId: number | null | undefined): Promise<{ userName: string; userAvatarUrl: string | null }> {
  if (userId == null) {
    return { userName: "匿名发布", userAvatarUrl: null };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { userName: "匿名发布", userAvatarUrl: null };
  }

  const userName = user.nameModerationStatus === "approved"
    ? buildUserName({ name: user.name, phone: user.phone })
    : buildUserName({ name: null, phone: user.phone });

  const userAvatarUrl = user.avatarModerationStatus === "approved"
    ? user.avatarUrl ?? null
    : null;

  return { userName, userAvatarUrl };
}

export async function createComment(data: InsertComment): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(comments).values(data);
  return Number(result[0].insertId);
}

export async function updateCommentModerationStatus(commentId: number, status: "approved" | "pending" | "rejected"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(comments).set({ moderationStatus: status }).where(eq(comments.id, commentId));
}

/** 主评论列表（仅 parentId 为 null），按热度（回复数）+ 时间排序 */
export async function getTopLevelCommentsByCardId(cardId: number): Promise<(Comment & { replyCount: number; userName: string; userAvatarUrl: string | null })[]> {
  const db = await getDb();
  if (!db) return [];

  await expireTimedOutPendingModeration();

  const topLevel = await db.select().from(comments)
    .where(and(eq(comments.cardId, cardId), isNull(comments.parentId), eq(comments.moderationStatus, "approved")))
    .orderBy(desc(comments.createdAt));

  if (topLevel.length === 0) return [];

  const ids = topLevel.map((c) => c.id);
  const countRows = await db.select({
    parentId: comments.parentId,
    replyCount: sql<number>`count(*)`.as("replyCount"),
  })
    .from(comments)
    .where(inArray(comments.parentId, ids))
    .groupBy(comments.parentId);

  const countMap = new Map<number, number>();
  countRows.forEach((r) => {
    if (r.parentId != null) countMap.set(r.parentId, Number(r.replyCount));
  });

  const withCount = topLevel.map((c) => ({
    ...c,
    replyCount: countMap.get(c.id) ?? 0,
  }));

  withCount.sort((a, b) => {
    const hotA = a.replyCount;
    const hotB = b.replyCount;
    if (hotB !== hotA) return hotB - hotA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Batch-fetch user info for display names and avatars
  const userIds = [...new Set(withCount.filter((c) => c.userId != null).map((c) => c.userId as number))];
  const userMap = new Map<number, { name: string | null; phone: string | null; avatarUrl: string | null; nameModerationStatus: string; avatarModerationStatus: string }>();
  if (userIds.length > 0) {
    const userRows = await db.select({ id: users.id, name: users.name, phone: users.phone, avatarUrl: users.avatarUrl, nameModerationStatus: users.nameModerationStatus, avatarModerationStatus: users.avatarModerationStatus })
      .from(users).where(inArray(users.id, userIds));
    userRows.forEach((u) => userMap.set(u.id, { name: u.name, phone: u.phone, avatarUrl: u.avatarUrl ?? null, nameModerationStatus: u.nameModerationStatus, avatarModerationStatus: u.avatarModerationStatus }));
  }

  return withCount.map((c) => ({
    ...c,
    userName: buildUserName(c.userId != null ? (() => {
      const u = userMap.get(c.userId);
      if (!u) return null;
      if (u.nameModerationStatus !== "approved") return { name: null, phone: u.phone };
      return { name: u.name, phone: u.phone };
    })() : null),
    userAvatarUrl: c.userId != null ? (() => {
      const u = userMap.get(c.userId);
      if (!u || u.avatarModerationStatus !== "approved") return null;
      return u.avatarUrl ?? null;
    })() : null,
  }));
}

/** 某条评论下的直接回复（楼中楼，2 层平铺），按时间正序 */
export async function getRepliesByParentId(parentId: number): Promise<(Comment & { replyCount: number; userName: string; userAvatarUrl: string | null; replyToUserName: string | null })[]> {
  const db = await getDb();
  if (!db) return [];

  await expireTimedOutPendingModeration();

  const replies = await db.select().from(comments)
    .where(and(eq(comments.parentId, parentId), eq(comments.moderationStatus, "approved")))
    .orderBy(comments.createdAt);

  if (replies.length === 0) return [];

  const ids = replies.map((c) => c.id);
  const countRows = await db.select({
    parentId: comments.parentId,
    replyCount: sql<number>`count(*)`.as("replyCount"),
  })
    .from(comments)
    .where(inArray(comments.parentId, ids))
    .groupBy(comments.parentId);

  const countMap = new Map<number, number>();
  countRows.forEach((r) => {
    if (r.parentId != null) countMap.set(r.parentId, Number(r.replyCount));
  });

  // Batch-fetch user info: commenter + replyToUser
  const commenterIds = [...new Set(replies.filter((c) => c.userId != null).map((c) => c.userId as number))];
  const replyToIds = [...new Set(replies.filter((c) => c.replyToUserId != null).map((c) => c.replyToUserId as number))];
  const allUserIds = [...new Set([...commenterIds, ...replyToIds])];

  const userMap = new Map<number, { name: string | null; phone: string | null; avatarUrl: string | null; nameModerationStatus: string; avatarModerationStatus: string }>();
  if (allUserIds.length > 0) {
    const userRows = await db.select({ id: users.id, name: users.name, phone: users.phone, avatarUrl: users.avatarUrl, nameModerationStatus: users.nameModerationStatus, avatarModerationStatus: users.avatarModerationStatus })
      .from(users).where(inArray(users.id, allUserIds));
    userRows.forEach((u) => userMap.set(u.id, { name: u.name, phone: u.phone, avatarUrl: u.avatarUrl ?? null, nameModerationStatus: u.nameModerationStatus, avatarModerationStatus: u.avatarModerationStatus }));
  }

  return replies.map((c) => ({
    ...c,
    replyCount: countMap.get(c.id) ?? 0,
    userName: buildUserName(c.userId != null ? (() => {
      const u = userMap.get(c.userId);
      if (!u) return null;
      if (u.nameModerationStatus !== "approved") return { name: null, phone: u.phone };
      return { name: u.name, phone: u.phone };
    })() : null),
    userAvatarUrl: c.userId != null ? (() => {
      const u = userMap.get(c.userId);
      if (!u || u.avatarModerationStatus !== "approved") return null;
      return u.avatarUrl ?? null;
    })() : null,
    replyToUserName: c.replyToUserId != null ? buildUserName((() => {
      const u = userMap.get(c.replyToUserId);
      if (!u) return null;
      if (u.nameModerationStatus !== "approved") return { name: null, phone: u.phone };
      return { name: u.name, phone: u.phone };
    })()) : null,
  }));
}

export async function getCommentById(id: number): Promise<Comment | null> {
  const db = await getDb();
  if (!db) return null;
  await expireTimedOutPendingModeration();
  const result = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return result[0] ?? null;
}

/** 兼容旧逻辑：返回该卡片下所有评论（扁平，按时间倒序） */
export async function getCommentsByCardId(cardId: number): Promise<Comment[]> {
  const db = await getDb();
  if (!db) return [];

  await expireTimedOutPendingModeration();

  return db.select().from(comments)
    .where(and(eq(comments.cardId, cardId), eq(comments.moderationStatus, "approved")))
    .orderBy(desc(comments.createdAt));
}

export async function getCommentsCount(cardId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  await expireTimedOutPendingModeration();
  
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(eq(comments.cardId, cardId), eq(comments.moderationStatus, "approved")));
  
  return result[0]?.count ?? 0;
}

export async function getVoteByUserAndCard(userId: number, cardId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.cardId, cardId)))
    .limit(1);
  
  return result[0] ?? null;
}

// ==================== Favorite Operations ====================

export async function createFavorite(data: InsertFavorite): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.userId == null) throw new Error("Favorite userId is required");

  await db.delete(favorites)
    .where(and(eq(favorites.userId, data.userId), eq(favorites.cardId, data.cardId)));

  const result = await db.insert(favorites).values(data);
  return Number(result[0].insertId);
}

export async function deleteFavoriteByUserId(userId: number, cardId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.cardId, cardId)));
}

export async function isFavoritedByUserId(userId: number, cardId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select().from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.cardId, cardId)))
    .limit(1);
  return result.length > 0;
}

export async function getFavoritesCountByCardId(cardId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(favorites)
    .where(eq(favorites.cardId, cardId));
  return result[0]?.count ?? 0;
}

export async function getFavoritesCountByUserId(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(distinct ${favorites.cardId})` })
    .from(favorites)
    .where(eq(favorites.userId, userId));
  return result[0]?.count ?? 0;
}

export async function getFavoritesByUserId(userId: number): Promise<{ cardId: number; createdAt: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    cardId: favorites.cardId,
    createdAt: favorites.createdAt,
  })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return result;
}

export async function getFavoritesPageByUserId(
  userId: number,
  options?: { cursor?: number; limit?: number }
): Promise<{ items: Array<{ id: number; cardId: number; createdAt: Date }>; nextCursor?: number }> {
  const db = await getDb();
  if (!db) return { items: [] };

  const pageSize = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const cursorClause = options?.cursor ? sql`and f.id < ${options.cursor}` : sql.empty();
  const result = await db.execute(sql<{
    id: number;
    cardId: number;
    createdAt: Date;
  }>`
    select latest.id, latest.cardId, latest.createdAt
    from (
      select max(f.id) as id, f.cardId, max(f.createdAt) as createdAt
      from ${favorites} f
      where f.userId = ${userId} ${cursorClause}
      group by f.cardId
    ) as latest
    order by latest.id desc
    limit ${pageSize + 1}
  `);
  const [rows] = result as unknown as [Array<{ id: number; cardId: number; createdAt: Date }>, unknown];

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
  };
}

// ==================== Feedback Operations ====================

export async function createFeedback(data: InsertFeedback): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(feedbacks).values(data);
  return Number(result[0].insertId);
}

// ==================== Moderation Records ====================

export async function createModerationRecord(data: InsertModerationRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(moderationRecords).values(data);
  return Number(result[0].insertId);
}

export async function getModerationRecordById(id: number): Promise<ModerationRecord | null> {
  const db = await getDb();
  if (!db) return null;
  await expireTimedOutPendingModeration();
  const result = await db.select().from(moderationRecords).where(eq(moderationRecords.id, id)).limit(1);
  return result[0] ?? null;
}

export async function listModerationRecords(
  status: "approved" | "pending" | "rejected" | undefined,
  limit: number = 50,
  offset: number = 0,
  options?: { targetTypes?: Array<"card" | "photo" | "comment" | "user_name" | "user_avatar">; startAt?: Date; endAt?: Date }
): Promise<ModerationRecord[]> {
  const db = await getDb();
  if (!db) return [];
  await expireTimedOutPendingModeration();
  const conditions = [] as any[];
  if (status) {
    conditions.push(eq(moderationRecords.status, status));
  }
  if (options?.targetTypes?.length) {
    conditions.push(inArray(moderationRecords.targetType, options.targetTypes));
  }
  if (options?.startAt) {
    conditions.push(gte(moderationRecords.createdAt, options.startAt));
  }
  if (options?.endAt) {
    conditions.push(lte(moderationRecords.createdAt, options.endAt));
  }
  return db.select().from(moderationRecords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(moderationRecords.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateModerationRecordDecision(
  recordId: number,
  status: "approved" | "rejected",
  moderatorUserId: number,
  manualReason?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(moderationRecords)
    .set({ status, moderatorUserId, manualReason: manualReason ?? null })
    .where(eq(moderationRecords.id, recordId));
}

async function expireTimedOutPendingModeration(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const cutoff = new Date(Date.now() - MODERATION_PENDING_TIMEOUT_MS);
  const expired = await db.select().from(moderationRecords)
    .where(and(eq(moderationRecords.status, "pending"), lte(moderationRecords.createdAt, cutoff)));

  if (expired.length === 0) return;

  for (const record of expired) {
    await db.update(moderationRecords)
      .set({ status: "rejected", manualReason: record.manualReason ?? "SDK 审核未通过，超过 10 分钟自动拒绝" })
      .where(eq(moderationRecords.id, record.id));

    if (record.targetType === "card") {
      await db.update(cards).set({ moderationStatus: "rejected" }).where(eq(cards.id, record.targetId));
      continue;
    }

    if (record.targetType === "photo") {
      const photo = await db.select().from(photos).where(eq(photos.id, record.targetId)).limit(1);
      if (photo[0]) {
        await db.update(photos).set({ moderationStatus: "rejected" }).where(eq(photos.id, record.targetId));
        await db.update(cards).set({ moderationStatus: "rejected" }).where(eq(cards.id, photo[0].cardId));
      }
      continue;
    }

    if (record.targetType === "comment") {
      await db.update(comments).set({ moderationStatus: "rejected" }).where(eq(comments.id, record.targetId));
      continue;
    }

    if (record.targetType === "user_name") {
      await db.update(users).set({ nameModerationStatus: "rejected" }).where(eq(users.id, record.targetId));
      continue;
    }

    if (record.targetType === "user_avatar") {
      await db.update(users).set({ avatarModerationStatus: "rejected" }).where(eq(users.id, record.targetId));
    }
  }
}
