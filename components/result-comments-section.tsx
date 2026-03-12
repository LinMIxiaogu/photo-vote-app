import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { getImageUrl } from "@/lib/utils";

type Photo = {
  id: number;
};

type CommentItem = {
  id: number;
  userId?: number | null;
  userName: string;
  userAvatarUrl?: string | null;
  content: string;
  images?: string[] | null;
  createdAt: Date | string;
  votedPhotoId: number | null;
  replyCount?: number;
  replyToUserName?: string | null;
};

type ReplyBlock = { replies: CommentItem[] };

type Props = {
  cardPhotos: Photo[];
  cardUserId: number | null;
  canViewComments?: boolean;
  comments: CommentItem[];
  expandedReplies: Record<number, ReplyBlock>;
  formatTimeLabel: (date: Date | string) => string;
  getInitials: (name: string) => string;
  loadingReplies: Record<number, boolean>;
  onCommentReply: (comment: CommentItem) => void;
  onLayout: (y: number) => void;
  onReplyToReply: (parentComment: CommentItem, reply: CommentItem) => void;
  onToggleReplies: (parentId: number) => void;
};

export function ResultCommentsSection({
  cardPhotos,
  cardUserId,
  canViewComments,
  comments,
  expandedReplies,
  formatTimeLabel,
  getInitials,
  loadingReplies,
  onCommentReply,
  onLayout,
  onReplyToReply,
  onToggleReplies,
}: Props) {
  const commentCount = comments.length;

  return (
    <View style={styles.section} onLayout={(event) => onLayout(event.nativeEvent.layout.y)}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionMetaLarge}>共 {commentCount} 条评论</Text>
      </View>

      {!canViewComments ? (
        <View style={styles.commentNotice}>
          <Text style={styles.commentNoticeTitle}>参与投票或收藏后可查看评论</Text>
        </View>
      ) : commentCount === 0 ? (
        <View style={styles.commentNotice}>
          <Text style={styles.commentNoticeTitle}>还没有评论</Text>
          <Text style={styles.commentNoticeText}>可以先写下你的看法，作为第一条讨论。</Text>
        </View>
      ) : (
        comments.map((comment) => {
          const expanded = expandedReplies[comment.id];
          const loading = loadingReplies[comment.id];
          const votedIndex =
            comment.votedPhotoId != null ? cardPhotos.findIndex((photo) => photo.id === comment.votedPhotoId) : -1;

          return (
            <View key={comment.id} style={styles.commentCard}>
              <View style={styles.commentHeader}>
                <View style={styles.commentIdentity}>
                  <View style={styles.commentAvatar}>
                    {comment.userAvatarUrl ? (
                      <Image source={{ uri: getImageUrl(comment.userAvatarUrl) }} style={styles.avatarImage} contentFit="cover" />
                    ) : (
                      <Text style={styles.commentAvatarText}>{getInitials(comment.userName)}</Text>
                    )}
                  </View>
                  <View style={styles.commentIdentityText}>
                    <View style={styles.commentNameRow}>
                      <Text style={styles.commentName}>{comment.userName}</Text>
                      {comment.userId != null && comment.userId === cardUserId ? <Text style={styles.authorText}>作者</Text> : null}
                      {votedIndex >= 0 ? <Text style={styles.voteMetaText}>选项 {votedIndex + 1}</Text> : null}
                    </View>
                    <Text style={styles.commentTime}>{formatTimeLabel(comment.createdAt)}</Text>
                  </View>
                </View>
                <Pressable onPress={() => onCommentReply(comment)} style={styles.replyInlineAction}>
                  <Text style={styles.replyActionText}>回复</Text>
                </Pressable>
              </View>
              {!!comment.content && <Text style={styles.commentContent}>{comment.content}</Text>}
              {comment.images && comment.images.length > 0 ? (
                <View style={styles.commentImageRow}>
                  {comment.images.map((imageUrl, imageIndex) => (
                    <Image
                      key={`${comment.id}-${imageIndex}`}
                      source={{ uri: getImageUrl(imageUrl) }}
                      style={styles.commentImage}
                      contentFit="cover"
                    />
                  ))}
                </View>
              ) : null}
              {comment.replyCount ? (
                <View style={styles.replyBlock}>
                  {expanded ? (
                    <>
                      <View style={styles.replyList}>
                        {expanded.replies.map((reply) => {
                          const replyVotedIndex =
                            reply.votedPhotoId != null ? cardPhotos.findIndex((photo) => photo.id === reply.votedPhotoId) : -1;

                          return (
                            <View key={reply.id} style={styles.replyItem}>
                              <View style={styles.replyAvatar}>
                                {reply.userAvatarUrl ? (
                                  <Image source={{ uri: getImageUrl(reply.userAvatarUrl) }} style={styles.avatarImage} contentFit="cover" />
                                ) : (
                                  <Text style={styles.replyAvatarText}>{getInitials(reply.userName)}</Text>
                                )}
                              </View>
                              <View style={styles.replyBody}>
                                <View style={styles.replyNameRow}>
                                  <View style={styles.replyMetaWrap}>
                                    <Text style={styles.replyName}>{reply.userName}</Text>
                                    {reply.userId != null && reply.userId === cardUserId ? <Text style={styles.authorText}>作者</Text> : null}
                                    {replyVotedIndex >= 0 ? <Text style={styles.voteMetaText}>选项 {replyVotedIndex + 1}</Text> : null}
                                  </View>
                                  <Text style={styles.replyTime}>{formatTimeLabel(reply.createdAt)}</Text>
                                </View>
                                <Text style={styles.replyContent}>
                                  {reply.replyToUserName ? `回复 @${reply.replyToUserName} ` : ""}
                                  {reply.content}
                                </Text>
                                {reply.images && reply.images.length > 0 ? (
                                  <View style={styles.commentImageRow}>
                                    {reply.images.map((imageUrl, imageIndex) => (
                                      <Image
                                        key={`${reply.id}-${imageIndex}`}
                                        source={{ uri: getImageUrl(imageUrl) }}
                                        style={styles.commentImage}
                                        contentFit="cover"
                                      />
                                    ))}
                                  </View>
                                ) : null}
                                <Pressable onPress={() => onReplyToReply(comment, reply)} style={styles.replyInlineAction}>
                                  <Text style={styles.replyActionText}>回复</Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                      <Pressable onPress={() => onToggleReplies(comment.id)}>
                        <Text style={styles.expandRepliesBtnText}>收起回复</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable onPress={() => onToggleReplies(comment.id)} disabled={loading}>
                      {loading ? (
                        <ActivityIndicator size="small" color="#8A4B38" />
                      ) : (
                        <Text style={styles.expandRepliesBtnText}>展开 {comment.replyCount} 条回复</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {canViewComments && commentCount > 0 ? (
        <View style={styles.commentsEndNotice}>
          <Text style={styles.commentsEndNoticeText}>已经到底了</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 18, paddingVertical: 18, gap: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center" },
  sectionMetaLarge: { fontSize: 16, fontWeight: "600", color: "#27211B" },
  commentNotice: { paddingVertical: 8, gap: 6 },
  commentNoticeTitle: { fontSize: 16, fontWeight: "700", color: "#3A312B" },
  commentNoticeText: { fontSize: 13, lineHeight: 20, color: "#8C877F" },
  commentsEndNotice: { paddingTop: 4, paddingBottom: 8, alignItems: "center" },
  commentsEndNoticeText: { fontSize: 12, color: "#B0AAA2" },
  commentCard: { paddingVertical: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ECE7E0" },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  commentIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  commentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#D8C9B7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 999 },
  commentAvatarText: { fontSize: 12, fontWeight: "800", color: "#5A4B3D" },
  commentIdentityText: { marginLeft: 10, flex: 1, gap: 2 },
  commentNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  commentName: { fontSize: 15, fontWeight: "700", color: "#27211B" },
  authorText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF8EF",
    backgroundColor: "#C85C3C",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  commentTime: { fontSize: 12, color: "#8C877F" },
  replyInlineAction: { alignSelf: "flex-start" },
  replyActionText: { fontSize: 12, fontWeight: "600", color: "#8A4B38" },
  voteMetaText: { fontSize: 12, color: "#8A4B38" },
  commentContent: { fontSize: 15, lineHeight: 24, color: "#423833" },
  commentImageRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  commentImage: { width: 88, height: 88, borderRadius: 14, backgroundColor: "#EDE7E0" },
  replyBlock: { gap: 10, marginLeft: 52, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: "#EFE7DE" },
  replyList: { gap: 10 },
  replyItem: { flexDirection: "row", gap: 10, paddingTop: 2 },
  replyAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#D8C9B7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  replyAvatarText: { fontSize: 11, fontWeight: "700", color: "#5A4B3D" },
  replyBody: { flex: 1, gap: 5 },
  replyNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  replyMetaWrap: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, flexWrap: "wrap" },
  replyName: { fontSize: 13, fontWeight: "700", color: "#3E342D" },
  replyTime: { fontSize: 11, color: "#9A938B" },
  replyContent: { fontSize: 14, lineHeight: 22, color: "#5A4E45" },
  expandRepliesBtnText: { fontSize: 12, fontWeight: "700", color: "#8A4B38" },
});