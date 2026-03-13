import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { moderateImages } from "./_core/aliyunImageModeration";
import { moderateText } from "./_core/aliyunTextModeration";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    deregister: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteUser(ctx.user.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // User operations
  users: router({
    updateName: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(20),
      }))
      .mutation(async ({ input, ctx }) => {
        const name = input.name.trim();
        const currentName = ctx.user.name?.trim() ?? "";

        if (name === currentName) {
          return {
            name,
            pendingReview: ctx.user.nameModerationStatus === "pending",
          };
        }

        const textMod = await moderateText(name, "nickname_detection");
        const status = textMod.pass ? "approved" : "pending";

        await db.updateUserName(ctx.user.id, name);
        await db.updateUserNameModerationStatus(ctx.user.id, status);
        await db.createModerationRecord({
          targetType: "user_name",
          targetId: ctx.user.id,
          status,
          autoResult: textMod.pass ? "pass" : textMod.result,
          autoMessage: textMod.pass ? null : (textMod.message ?? "Username needs review"),
        });

        return { name, pendingReview: !textMod.pass };
      }),
    updateAvatar: protectedProcedure
      .input(z.object({
        base64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const extension = input.mimeType.split("/")[1] || "jpg";
        const fileKey = `avatars/${ctx.user.id}-${randomSuffix}.${extension}`;
        const buffer = Buffer.from(input.base64, "base64");
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const imageMod = await moderateImages([url]);
        const status = imageMod.pass ? "approved" : "pending";
        await db.updateUserAvatar(ctx.user.id, url);
        await db.updateUserAvatarModerationStatus(ctx.user.id, status);
        await db.createModerationRecord({
          targetType: "user_avatar",
          targetId: ctx.user.id,
          status,
          autoResult: imageMod.pass ? "pass" : "block",
          autoMessage: imageMod.pass ? null : (imageMod.message ?? "Avatar image needs review"),
        });
        return { avatarUrl: url, pendingReview: !imageMod.pass };
      }),
  }),

  // Card operations
  cards: router({
    // Create a new card with photos
    create: protectedProcedure
      .input(z.object({
        title: z.string().max(14).optional(),
        description: z.string().max(2000).optional(),
        photos: z.array(z.object({
          base64: z.string(),
          mimeType: z.string(),
        })).min(2).max(4),
      }))
      .mutation(async ({ input, ctx }) => {
        const cardId = await db.createCard({
          userId: ctx.user.id,
          title: input.title || null,
          description: input.description || null,
          moderationStatus: "pending",
        });

        let pendingReview = false;

        try {
          const photoRecords = await Promise.all(
            input.photos.map(async (photo, index) => {
              const randomSuffix = Math.random().toString(36).substring(2, 10);
              const extension = photo.mimeType.split("/")[1] || "jpg";
              const fileKey = `cards/${cardId}/photo-${index}-${randomSuffix}.${extension}`;
              const buffer = Buffer.from(photo.base64, "base64");
              const { url } = await storagePut(fileKey, buffer, photo.mimeType);
              return { cardId, url, photoIndex: index, moderationStatus: "pending" as const };
            }),
          );

          await db.createPhotos(photoRecords);
          const createdPhotos = await db.getPhotosByCardId(cardId, { includeUnapproved: true });

          const textChecks: Array<{ pass: boolean; message?: string; result?: string }> = [];
          if (input.title?.trim()) {
            const mod = await moderateText(input.title.trim(), "comment_detection");
            textChecks.push({ pass: mod.pass, message: mod.message, result: mod.result });
          }
          if (input.description?.trim()) {
            const mod = await moderateText(input.description.trim(), "comment_detection");
            textChecks.push({ pass: mod.pass, message: mod.message, result: mod.result });
          }
          const textFail = textChecks.find((c) => !c.pass);
          const textPass = !textFail;

          const imageMod = await moderateImages(photoRecords.map((p) => p.url));
          const imagePass = imageMod.pass;

          const overallPass = textPass && imagePass;
          const cardStatus = overallPass ? "approved" : "pending";
          await db.updateCardModerationStatus(cardId, cardStatus);
          pendingReview = !overallPass;

          if (overallPass) {
            for (const p of createdPhotos) {
              await db.updatePhotoModerationStatus(p.id, "approved");
            }
          }

          await db.createModerationRecord({
            targetType: "card",
            targetId: cardId,
            status: cardStatus,
            autoResult: (overallPass ? "pass" : (textFail?.result ?? "block")) as "pass" | "review" | "block",
            autoMessage: overallPass ? null : (textFail?.message ?? imageMod.message ?? "Card needs review"),
          });

          for (const p of createdPhotos) {
            await db.createModerationRecord({
              targetType: "photo",
              targetId: p.id,
              status: cardStatus,
              autoResult: imagePass ? "pass" : "block",
              autoMessage: imagePass ? null : (imageMod.message ?? "Photo needs review"),
            });
          }
        } catch (err) {
          // Rollback: delete the card if photo upload or save fails
          await db.deleteCard(cardId, ctx.user.id);
          throw err;
        }

        return { cardId, pendingReview };
      }),

    // Get card by ID with photos
    getById: publicProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const card = await db.getCardById(input.cardId, { includeUnapproved: true });
        if (!card) return null;
        const isOwner = !!ctx.user && card.userId === ctx.user.id;
        if (card.moderationStatus !== "approved" && !isOwner) return null;
        const photos = await db.getPhotosByCardId(input.cardId, { includeUnapproved: isOwner });
        const publisher = await db.getUserDisplayProfile(card.userId);
        return { ...card, photos, ...publisher };
      }),

    // Get cards created by the current logged-in user
    getMyCards: protectedProcedure
      .query(async ({ ctx }) => {
        const cards = await db.getCardsByUserId(ctx.user.id);
        const cardsWithPhotos = await Promise.all(
          cards.map(async (card) => {
            const photos = await db.getPhotosByCardId(card.id, { includeUnapproved: true });
            return { ...card, photos };
          })
        );
        return cardsWithPhotos;
      }),

    // Delete own card (and related votes, comments, favorites, photos)
    delete: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const deleted = await db.deleteCard(input.cardId, ctx.user.id);
        if (!deleted) {
          throw new Error("Card not found or you do not have permission to delete it");
        }
        return { success: true };
      }),

    // Update title and description of own card
    update: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        title: z.string().max(14).nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const updated = await db.updateCard(input.cardId, ctx.user.id, {
          title: input.title,
          description: input.description,
        });
        if (!updated) {
          throw new Error("Card not found or you do not have permission to update it");
        }
        const textChecks: Array<{ pass: boolean; message?: string; result?: string }> = [];
        if (typeof input.title === "string" && input.title.trim()) {
          const mod = await moderateText(input.title.trim(), "comment_detection");
          textChecks.push({ pass: mod.pass, message: mod.message, result: mod.result });
        }
        if (typeof input.description === "string" && input.description.trim()) {
          const mod = await moderateText(input.description.trim(), "comment_detection");
          textChecks.push({ pass: mod.pass, message: mod.message, result: mod.result });
        }
        const textFail = textChecks.find((c) => !c.pass);
        const textPass = !textFail;

        const photos = await db.getPhotosByCardId(input.cardId, { includeUnapproved: true });
        const photosAllApproved = photos.every((p) => p.moderationStatus === "approved");
        const cardStatus = textPass && photosAllApproved ? "approved" : "pending";
        await db.updateCardModerationStatus(input.cardId, cardStatus);

        await db.createModerationRecord({
          targetType: "card",
          targetId: input.cardId,
          status: cardStatus,
          autoResult: (textPass ? "pass" : (textFail?.result ?? "block")) as "pass" | "review" | "block",
          autoMessage: textPass ? null : (textFail?.message ?? "Card needs review"),
        });
        return { success: true, pendingReview: cardStatus !== "approved" };
      }),

    // Get a random card to vote on
    getRandomForVoting: protectedProcedure
      .query(async ({ ctx }) => {
        const card = await db.getRandomAvailableCard(ctx.user.id);
        if (!card) return null;
        const photos = await db.getPhotosByCardId(card.id);
        return { ...card, photos };
      }),

    // Get multiple random cards for preloading (exclude recently shown to avoid repeat)
    // Public: unauthenticated users can browse cards (but cannot vote/comment/favorite)
    getRandomForVotingBatch: publicProcedure
      .input(z.object({
        count: z.number().min(1).max(50),
        excludeCardIds: z.array(z.number()).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const exclude = input.excludeCardIds ?? [];
        // Pass userId only when authenticated; unauthenticated users see all cards
        const cards = await db.getRandomAvailableCards(input.count, exclude, ctx.user?.id);
        const cardsWithPhotos = await Promise.all(
          cards.map(async (card) => {
            const photos = await db.getPhotosByCardId(card.id);
            return { ...card, photos };
          })
        );
        // Filter out cards that have no photos (orphan cards from failed uploads)
        return cardsWithPhotos.filter((c) => c.photos.length > 0);
      }),
  }),

  // Vote operations
  votes: router({
    // Submit a vote (requires login)
    submit: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        photoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const existingVote = await db.getVoteByUserAndCard(ctx.user.id, input.cardId);
        if (existingVote) {
          const photos = await db.getPhotosByCardId(input.cardId);
          const totalVotes = photos.reduce((sum, p) => sum + p.voteCount, 0);
          const votedPhoto = photos.find(p => p.id === existingVote.photoId);
          const voteCount = votedPhoto?.voteCount ?? 0;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const photoStats = photos.map(photo => ({
            id: photo.id,
            voteCount: photo.voteCount,
            percentage: totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0,
          }));
          return {
            success: true,
            alreadyVoted: true as const,
            photoId: existingVote.photoId,
            percentage,
            voteCount,
            totalVotes,
            voteDate: existingVote.voteDate,
            photoStats,
          };
        }

        const today = new Date().toISOString().split('T')[0];
        await db.createVote({
          userId: ctx.user.id,
          cardId: input.cardId,
          photoId: input.photoId,
          voteDate: today,
        });

        await db.incrementPhotoVoteCount(input.photoId);

        const card = await db.getCardById(input.cardId);
        if (card) {
          const newTotalVotes = card.totalVotes + 1;
          await db.updateCardVotes(input.cardId, newTotalVotes);
        }

        const photos = await db.getPhotosByCardId(input.cardId);
        const votedPhoto = photos.find(p => p.id === input.photoId);
        const totalVotes = photos.reduce((sum, p) => sum + p.voteCount, 0);
        const percentage = totalVotes > 0 && votedPhoto 
          ? Math.round((votedPhoto.voteCount / totalVotes) * 100) 
          : 0;
        const photoStats = photos.map(photo => ({
          id: photo.id,
          voteCount: photo.voteCount,
          percentage: totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0,
        }));

        return {
          success: true,
          alreadyVoted: false as const,
          photoId: input.photoId,
          percentage,
          voteCount: votedPhoto?.voteCount ?? 0,
          totalVotes,
          voteDate: today,
          photoStats,
        };
      }),

    // Check if current user has voted on a card
    hasVoted: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.hasVotedOnCard(ctx.user.id, input.cardId);
      }),

    // Check if current user has ever cast any vote (used for new-user guide)
    hasAnyVote: protectedProcedure
      .query(async ({ ctx }) => {
        return db.hasAnyVote(ctx.user.id);
      }),

    // Get current user's vote result on a card
    myVoteResult: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const vote = await db.getVoteByUserAndCard(ctx.user.id, input.cardId);
        if (!vote) return null;

        const photos = await db.getPhotosByCardId(input.cardId);
        const totalVotes = photos.reduce((sum, p) => sum + p.voteCount, 0);
        const votedPhoto = photos.find((p) => p.id === vote.photoId);
        const voteCount = votedPhoto?.voteCount ?? 0;
        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        const photoStats = photos.map((photo) => ({
          id: photo.id,
          voteCount: photo.voteCount,
          percentage: totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0,
        }));

        return {
          photoId: vote.photoId,
          voteCount,
          percentage,
          totalVotes,
          photoStats,
          voteDate: vote.voteDate,
          createdAt: vote.createdAt,
        };
      }),
  }),

  // Comment operations
  comments: router({
    // 闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴柛娑橈攻濞呯娀鏌ｅΟ鑲╁笡闁稿鍔戦弻鏇熺節韫囨洜鏆犻梺缁樻尰濞茬喖寮诲☉妯锋瀻婵☆垵娅ｆ禒顓㈡⒑缂佹ɑ鎯堢紒缁樼箞楠炲棝宕堕埞鎯т壕闁挎繂楠搁獮妯讳繆閸欏鐏撮柟顔款潐閹峰懘宕崟顓燁吇缂傚倷娴囨ご绋款熆濮椻偓椤㈡瑨绠涘☉妯肩厬婵犮垼娉涢…顒€顭囬幘鍓佺＝濞达絿鍏樺鐑芥煕閺傚尅韬柛鈹惧亾濡炪倖鍨煎▔鏇⑺囬敃鍌涚厱闁规惌鍨崇弧鈧悗娈垮枔閸旀垿鐛崱娑欏亱闁割偒鍋呴ˉ鏃堟⒒娴ｇ儤鍤€闁宦板姂閹囧籍閸屾稑顏搁梺缁樻煥閹测剝鍒婄€涙绡€濠电姴鍊归ˉ鎴︽煕鐎ｎ偅宕岀€规洏鍔戦、娆撴嚍閵夈儺浼嗘繝?
    getByCardId: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const card = await db.getCardById(input.cardId, { includeUnapproved: true }); const isOwner = !!card && card.userId === ctx.user.id;
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        const hasFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (!isOwner && !hasVoted && !hasFavorited) {
          return { comments: [], canView: false };
        }

        const comments = await db.getTopLevelCommentsByCardId(input.cardId);
        const commentsWithVotes = await Promise.all(
          comments.map(async (comment) => {
            const vote = comment.userId != null
              ? await db.getVoteByUserAndCard(comment.userId, input.cardId)
              : null;
            return { ...comment, votedPhotoId: vote?.photoId ?? null };
          })
        );
        return { comments: commentsWithVotes, canView: true };
      }),

    // 闂傚倷绀侀崥瀣磿閹惰棄搴婇柤鑹扮堪娴滃綊鏌涢妷顔煎闁藉啰鍠栭弻鐔兼焽閿曗偓楠炴鏌﹂崒姘煎剶闁诡喖缍婂畷鎯邦槻妞ゅ浚鍓氶妵鍕籍閳ь剟宕归崜浣虹煓濠㈣泛澶囬崑鎾绘晲鎼粹€愁潽闂佷紮缍佹禍鍫曞蓟濞戙垹唯鐟滃秵绂掑鍕╀簻?
    getReplies: protectedProcedure
      .input(z.object({
        parentId: z.number(),
        cardId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const card = await db.getCardById(input.cardId, { includeUnapproved: true }); const isOwner = !!card && card.userId === ctx.user.id;
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        const hasFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (!isOwner && !hasVoted && !hasFavorited) {
          return { replies: [], parentUserName: null };
        }
        const parent = await db.getCommentById(input.parentId);
        if (!parent || parent.cardId !== input.cardId) {
          return { replies: [], parentUserName: null };
        }
        const replies = await db.getRepliesByParentId(input.parentId);
        const repliesWithVotes = await Promise.all(
          replies.map(async (comment) => {
            const vote = comment.userId != null
              ? await db.getVoteByUserAndCard(comment.userId, input.cardId)
              : null;
            return { ...comment, votedPhotoId: vote?.photoId ?? null };
          })
        );
        return { replies: repliesWithVotes, parentUserName: null };
      }),

    // 闂傚倷绀侀幉锟犳偡閿曞倸鍨傚┑鍌滎焾杩濋梺鍛婂姦娴滄繄鈧碍宀搁弻娑㈠即閵娿儲鐝梺鍝ュ枎閻楁捇寮婚妸銉㈡婵炲棙甯掗ˉ婵嬫⒑閸涘﹤鐓€缂佺粯绻堥悰顔芥償閵娿儱宓嗛梺缁橈供閸犳牗绂嶉崼鏇熲拺闂傚牊绋掗ˉ娆戠磼閳ь剚绗熼埀顒€鐣峰▎鎾存櫢闁绘灏欓崫妤呮⒑鐠団€崇仯濠⒀勵殜钘熼柟杈鹃檮閻撴瑩鎮楀☉娆樼劷濠⑿板洦鍋ｉ柟閭﹀枛閺嬫垿鏌熷畡鐗堝櫣妞ゎ厹鍔戝畷杈疀閹炬彃顥氶梻浣告啞娓氭宕板Δ鍛闁告浼濋悷閭︾叆闁告侗鍘兼俊娲⒑閸濆嫮鐏遍柛鐘崇墪閻ｇ兘鏁愭径妯绘櫖濠殿喗锕╅崜娑樼暆濞戙垺鐓?
    create: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        content: z.string().min(0).max(500),
        parentId: z.number().optional(),
        replyToUserId: z.number().optional(),
        imageUrls: z.array(z.string().url()).max(2).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!input.content.trim() && (!input.imageUrls || input.imageUrls.length === 0)) {
          throw new Error("评论内容或图片不能为空");
        }
        const card = await db.getCardById(input.cardId, { includeUnapproved: true }); const isOwner = !!card && card.userId === ctx.user.id;
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        const hasFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (!isOwner && !hasVoted && !hasFavorited) {
          throw new Error("参与投票后可发表评论");
        }
        if (input.parentId != null) {
          const parent = await db.getCommentById(input.parentId);
          if (!parent || parent.cardId !== input.cardId) {
            throw new Error("Invalid reply target");
          }
        }
        let textPass = true;
        let textFail: { message?: string; result?: string } | null = null;
        if (input.content.trim()) {
          const mod = await moderateText(input.content.trim(), "comment_detection");
          textPass = mod.pass;
          if (!mod.pass) textFail = { message: mod.message, result: mod.result };
        }
        const imageMod = input.imageUrls?.length ? await moderateImages(input.imageUrls) : { pass: true as const };
        const imagePass = imageMod.pass;
        const overallPass = textPass && imagePass;
        const commentStatus = overallPass ? "approved" : "pending";
        const commentId = await db.createComment({
          cardId: input.cardId,
          userId: ctx.user.id,
          content: input.content.trim(),
          parentId: input.parentId ?? undefined,
          replyToUserId: input.replyToUserId ?? undefined,
          ...(input.imageUrls?.length ? { images: input.imageUrls } : {}),
          moderationStatus: commentStatus,
        });
        await db.createModerationRecord({
          targetType: "comment",
          targetId: commentId,
          status: commentStatus,
          autoResult: (overallPass ? "pass" : (textFail?.result ?? "block")) as "pass" | "review" | "block",
          autoMessage: overallPass ? null : (textFail?.message ?? imageMod.message ?? "Comment needs review"),
        });
        return { commentId, pendingReview: !overallPass };
      }),

    // Get comments count
    getCount: publicProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input }) => {
        const count = await db.getCommentsCount(input.cardId);
        return { count };
      }),
  }),

  // Feedback operations
  feedbacks: router({
    submit: protectedProcedure
      .input(z.object({
        type: z.enum(["bug", "suggestion", "other"]),
        content: z.string().min(1).max(2000),
        contactInfo: z.string().max(255).optional(),
        /** Optional screenshots as base64 data URLs; stored as JSON array in DB */
        screenshots: z.array(z.string().max(10_000_000)).max(9).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createFeedback({
          userId: ctx.user.id,
          type: input.type,
          content: input.content,
          contactInfo: input.contactInfo,
          screenshot: input.screenshots?.length
            ? JSON.stringify(input.screenshots)
            : undefined,
        });
        return { success: true };
      }),
  }),

  // Favorite operations
  favorites: router({
    // Toggle favorite (requires login + must have voted)
    toggle: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const hasVoted = await db.hasVotedOnCard(ctx.user.id, input.cardId);
        if (!hasVoted) {
          throw new Error("Must vote on this card before favoriting");
        }
        const isFav = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        if (isFav) {
          await db.deleteFavoriteByUserId(ctx.user.id, input.cardId);
          return { isFavorited: false };
        }
        await db.createFavorite({ cardId: input.cardId, userId: ctx.user.id });
        return { isFavorited: true };
      }),

    // Check if card is favorited by current user
    check: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input, ctx }) => {
        const isFavorited = await db.isFavoritedByUserId(ctx.user.id, input.cardId);
        return { isFavorited };
      }),

    count: publicProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input }) => {
        const count = await db.getFavoritesCountByCardId(input.cardId);
        return { count };
      }),

    // Get current user's favorites
    getMyFavorites: protectedProcedure
      .input(z.object({
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const page = await db.getFavoritesPageByUserId(ctx.user.id, {
          cursor: input?.cursor,
          limit: input?.limit ?? 20,
        });
        const totalCount = await db.getFavoritesCountByUserId(ctx.user.id);
        const favoritesWithDetails = await Promise.all(
          page.items.map(async (fav) => {
            const card = await db.getCardById(fav.cardId);
            if (!card) return null;
            const photos = await db.getPhotosByCardId(fav.cardId);
            return { ...card, photos, favoritedAt: fav.createdAt };
          })
        );
        return {
          items: favoritesWithDetails.filter(Boolean),
          nextCursor: page.nextCursor,
          totalCount,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
