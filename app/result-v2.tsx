import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";

const SKIP_VOTE_REDIRECT_KEY = "@skip_vote_redirect";

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

function formatTimeLabel(date: Date | string) {
  return new Date(date).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string) {
  return name.trim().slice(-2) || "用户";
}

export default function ResultScreenV2() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ cardId: string; from?: string }>();
  const cardId = params.cardId ? parseInt(params.cardId, 10) : 0;
  const fromFavorites = params.from === "favorites";

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const isPickingImageRef = useRef(false);

  const [commentText, setCommentText] = useState("");
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [commentImageUrls, setCommentImageUrls] = useState<string[]>([]);
  const [commentUploading, setCommentUploading] = useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [commentsAnchorY, setCommentsAnchorY] = useState(0);
  const [refreshingComments, setRefreshingComments] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, ReplyBlock>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<number, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<{ parentCommentId: number; userName: string; replyToUserId?: number | null } | null>(null);

  const utils = trpc.useUtils();
  const { data: card } = trpc.cards.getById.useQuery({ cardId }, { enabled: cardId > 0 });
  const { data: commentsData, refetch: refetchComments } = trpc.comments.getByCardId.useQuery(
    { cardId },
    { enabled: cardId > 0 && !!user },
  );
  const { data: favoriteData } = trpc.favorites.check.useQuery({ cardId }, { enabled: cardId > 0 && !!user });
  const { data: favoriteCountData } = trpc.favorites.count.useQuery({ cardId }, { enabled: cardId > 0 });

  const isFavorited = favoriteData?.isFavorited ?? false;
  const comments = (commentsData?.comments ?? []) as CommentItem[];

  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onSuccess: async (data) => {
      utils.favorites.check.setData({ cardId }, { isFavorited: data.isFavorited });
      utils.favorites.count.setData({ cardId }, (prev) => ({
        count: Math.max(0, (prev?.count ?? 0) + (data.isFavorited ? 1 : -1)),
      }));
      await utils.favorites.check.invalidate();
      await utils.favorites.count.invalidate();
      await utils.favorites.getMyFavorites.invalidate();
    },
  });

  const createCommentMutation = trpc.comments.create.useMutation({
    onSuccess: async (data) => {
      const parentId = replyingTo?.parentCommentId;
      setCommentText("");
      setCommentImages([]);
      setCommentImageUrls([]);
      setReplyingTo(null);
      setIsComposerExpanded(false);
      Keyboard.dismiss();
      await refetchComments();
      if (parentId != null) {
        setLoadingReplies((prev) => ({ ...prev, [parentId]: true }));
        try {
          const res = await utils.comments.getReplies.fetch({ parentId, cardId });
          setExpandedReplies((prev) => ({ ...prev, [parentId]: { replies: res.replies as CommentItem[] } }));
        } finally {
          setLoadingReplies((prev) => ({ ...prev, [parentId]: false }));
        }
      }
      if (data?.pendingReview) {
        Alert.alert("提示", "评论已提交审核，通过后将展示");
      }
    },
    onError: (error) => {
      Alert.alert("发送失败", error.message || "请稍后重试");
    },
  });
  const canSendComment = !!user && (!!commentText.trim() || commentImageUrls.length > 0) && !createCommentMutation.isPending && !commentUploading;

  const sortedPhotos = useMemo(() => (card ? [...card.photos].sort((a, b) => b.voteCount - a.voteCount) : []), [card]);
  const topPhoto = sortedPhotos[0];
  const totalVotes = useMemo(() => sortedPhotos.reduce((sum, item) => sum + item.voteCount, 0), [sortedPhotos]);
  const commentCount = comments.length;

  const handleBack = useCallback(() => {
    if (fromFavorites) {
      router.back();
      return;
    }
    AsyncStorage.setItem(SKIP_VOTE_REDIRECT_KEY, "1").catch(console.error);
    router.replace("/");
  }, [fromFavorites, router]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });

      return () => subscription.remove();
    }, [handleBack]),
  );

  const scrollToCommentsTop = useCallback((focusInput?: boolean) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, commentsAnchorY - 8), animated: true });
    if (focusInput) {
      setIsComposerExpanded(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commentsAnchorY]);

  const handleRefreshComments = useCallback(async () => {
    if (!commentsData?.canView) return;
    setRefreshingComments(true);
    try {
      await refetchComments();
    } finally {
      setRefreshingComments(false);
    }
  }, [commentsData?.canView, refetchComments]);

  const pickCommentImage = useCallback(async () => {
    if (commentImages.length >= 2) return;
    isPickingImageRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: false,
        quality: 1,
        base64: false,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setCommentUploading(true);
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const base64 = compressed.base64 ?? "";
      const apiBase = getApiBaseUrl();
      const { getSessionToken } = await import("@/lib/_core/auth");
      const token = await getSessionToken();
      const uploadRes = await fetch(`${apiBase}/api/upload`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ base64, mimeType: "image/jpeg", directory: "comments" }),
      });
      const json = await uploadRes.json() as { url?: string; error?: string };
      if (!uploadRes.ok || !json.url) {
        throw new Error(json.error ?? "图片上传失败");
      }
      setCommentImages((prev) => [...prev, compressed.uri]);
      setCommentImageUrls((prev) => [...prev, json.url as string]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "图片上传失败，请重试";
      Alert.alert("上传失败", message);
    } finally {
      isPickingImageRef.current = false;
      setCommentUploading(false);
      setIsComposerExpanded(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commentImages.length]);

  const removeCommentImage = useCallback((index: number) => {
    setCommentImages((prev) => prev.filter((_, i) => i !== index));
    setCommentImageUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleExpandReplies = useCallback(async (parentId: number) => {
    if (!cardId || loadingReplies[parentId]) return;
    if (expandedReplies[parentId]) {
      setExpandedReplies((prev) => {
        const next = { ...prev };
        delete next[parentId];
        return next;
      });
      return;
    }
    setLoadingReplies((prev) => ({ ...prev, [parentId]: true }));
    try {
      const res = await utils.comments.getReplies.fetch({ parentId, cardId });
      setExpandedReplies((prev) => ({ ...prev, [parentId]: { replies: res.replies as CommentItem[] } }));
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [parentId]: false }));
    }
  }, [cardId, expandedReplies, loadingReplies, utils.comments.getReplies]);

  const handleSubmitComment = useCallback(() => {
    if ((!commentText.trim() && commentImageUrls.length === 0) || !cardId || commentUploading) return;
    if (!user) {
      if (Platform.OS === "web") {
        window.alert("请先登录后评论");
      } else {
        Alert.alert("提示", "请先登录后评论", [
          { text: "去登录", onPress: () => router.push("/login") },
          { text: "取消" },
        ]);
      }
      return;
    }
    createCommentMutation.mutate({
      cardId,
      content: commentText.trim(),
      imageUrls: commentImageUrls.length > 0 ? commentImageUrls : undefined,
      parentId: replyingTo?.parentCommentId,
      replyToUserId: replyingTo?.replyToUserId ?? undefined,
    });
  }, [cardId, commentImageUrls, commentText, commentUploading, createCommentMutation, replyingTo, router, user]);

  const handleToggleFavorite = useCallback(() => {
    if (!cardId || toggleFavoriteMutation.isPending) return;
    if (!user) {
      if (Platform.OS === "web") {
        window.alert("请先登录后收藏");
      } else {
        Alert.alert("提示", "请先登录后收藏", [
          { text: "去登录", onPress: () => router.push("/login") },
          { text: "取消" },
        ]);
      }
      return;
    }
    toggleFavoriteMutation.mutate({ cardId });
  }, [cardId, router, toggleFavoriteMutation, user]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      if (!isPickingImageRef.current) {
        setIsComposerExpanded(false);
      }
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (!card) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center" style={{ backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator size="large" color="#C85C3C" />
        <Text style={styles.loadingText}>加载中...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1" style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <View style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            refreshControl={commentsData?.canView ? <RefreshControl refreshing={refreshingComments} onRefresh={handleRefreshComments} tintColor="#8A4B38" /> : undefined}
          >
            <View style={styles.header}>
              <Pressable onPress={handleBack} style={styles.headerIconButton}>
                <Text style={styles.headerBackText}>‹</Text>
              </Pressable>
              <View style={styles.headerIdentity}>
                <View style={styles.headerAvatar}>
                  {card.userAvatarUrl ? (
                    <Image source={{ uri: getImageUrl(card.userAvatarUrl) }} style={styles.avatarImage} contentFit="cover" />
                  ) : (
                    <Text style={styles.headerAvatarPlaceholder}>{getInitials(card.userName ?? "匿名发布")}</Text>
                  )}
                </View>
                <View style={styles.headerIdentityText}>
                  <Text style={styles.headerName}>{card.userName ?? "匿名发布"}</Text>
                </View>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.heroCard}>
              {topPhoto ? <Image source={{ uri: getImageUrl(topPhoto.url) }} style={styles.heroImage} contentFit="cover" /> : <View style={styles.heroImageFallback} />}
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>投票结果</Text>
                <Text style={styles.sectionMeta}>{totalVotes} 人参与</Text>
              </View>
              <View style={styles.resultList}>
                {sortedPhotos.map((photo, index) => {
                  const percentage = totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0;
                  const isLeader = index === 0;
                  return (
                    <View key={photo.id} style={styles.resultRow}>
                      <View style={styles.resultThumbWrap}>
                        <Image source={{ uri: getImageUrl(photo.url) }} style={styles.resultThumb} contentFit="cover" />
                        <View style={[styles.rankDot, isLeader && styles.rankDotLeader]}>
                          <Text style={[styles.rankDotText, isLeader && styles.rankDotTextLeader]}>{index + 1}</Text>
                        </View>
                      </View>
                      <View style={styles.resultMain}>
                        <View style={styles.resultLabels}>
                          <Text style={styles.resultLabel}>选项 {photo.photoIndex + 1}</Text>
                          <Text style={styles.resultValue}>{percentage}%</Text>
                        </View>
                        <View style={styles.resultTrack}>
                          <View style={[styles.resultFill, isLeader ? styles.resultFillLeader : styles.resultFillDefault, { width: `${Math.max(percentage, 6)}%` }]} />
                        </View>
                      </View>
                      <Text style={styles.resultVotes}>{photo.voteCount}票</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.section}>
              <Text style={styles.detailTitle}>{card.title?.trim() || "这组照片你会选哪一张？"}</Text>
              {card.description ? <Text style={styles.detailDescription}>{card.description}</Text> : null}
              <Text style={styles.detailMetaText}>{formatTimeLabel(card.createdAt)}</Text>
              <View style={styles.detailMetaRow}>
                <Text style={styles.detailMetaText}>发布于 {formatTimeLabel(card.createdAt)}</Text>
                <Text style={styles.detailMetaText}>{card.photos.length} 张照片</Text>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.section} onLayout={(event) => setCommentsAnchorY(event.nativeEvent.layout.y)}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionMetaLarge}>共 {commentCount} 条评论</Text>
              </View>

              {!commentsData?.canView ? (
                <View style={styles.commentNotice}>
                  <Text style={styles.commentNoticeTitle}>参与投票或收藏后可查看评论</Text>
                  <Text style={styles.commentNoticeText}>当前评论权限规则与旧页面保持一致。</Text>
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
                  const votedIndex = comment.votedPhotoId != null ? card.photos.findIndex((photo) => photo.id === comment.votedPhotoId) : -1;
                  return (
                    <View key={comment.id} style={styles.commentCard}>
                      <View style={styles.commentHeader}>
                        <View style={styles.commentIdentity}>
                          <View style={styles.commentAvatar}>
                            {comment.userAvatarUrl ? <Image source={{ uri: getImageUrl(comment.userAvatarUrl) }} style={styles.avatarImage} contentFit="cover" /> : <Text style={styles.commentAvatarText}>{getInitials(comment.userName)}</Text>}
                          </View>
                          <View style={styles.commentIdentityText}>
                            <View style={styles.commentNameRow}>
                              <Text style={styles.commentName}>{comment.userName}</Text>
                              {comment.userId != null && comment.userId === card.userId ? <Text style={styles.authorText}>作者</Text> : null}
                              {votedIndex >= 0 ? <Text style={styles.voteMetaText}>选项 {votedIndex + 1}</Text> : null}
                            </View>
                            <Text style={styles.commentTime}>{formatTimeLabel(comment.createdAt)}</Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={() => {
                            setReplyingTo({ parentCommentId: comment.id, userName: comment.userName, replyToUserId: comment.userId });
                            scrollToCommentsTop(true);
                          }}
                          style={styles.replyInlineAction}
                        >
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
                                  const replyVotedIndex = reply.votedPhotoId != null ? card.photos.findIndex((photo) => photo.id === reply.votedPhotoId) : -1;
                                  return (
                                    <View key={reply.id} style={styles.replyItem}>
                                      <View style={styles.replyAvatar}>
                                        {reply.userAvatarUrl ? <Image source={{ uri: getImageUrl(reply.userAvatarUrl) }} style={styles.avatarImage} contentFit="cover" /> : <Text style={styles.replyAvatarText}>{getInitials(reply.userName)}</Text>}
                                      </View>
                                      <View style={styles.replyBody}>
                                        <View style={styles.replyNameRow}>
                                          <View style={styles.replyMetaWrap}>
                                            <Text style={styles.replyName}>{reply.userName}</Text>
                                            {reply.userId != null && reply.userId === card.userId ? <Text style={styles.authorText}>作者</Text> : null}
                                            {replyVotedIndex >= 0 ? <Text style={styles.voteMetaText}>选项 {replyVotedIndex + 1}</Text> : null}
                                          </View>
                                          <Text style={styles.replyTime}>{formatTimeLabel(reply.createdAt)}</Text>
                                        </View>
                                        <Text style={styles.replyContent}>{reply.replyToUserName ? `回复 @${reply.replyToUserName} ` : ""}{reply.content}</Text>
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
                                        <Pressable
                                          onPress={() => {
                                            setReplyingTo({ parentCommentId: comment.id, userName: reply.userName, replyToUserId: reply.userId });
                                            scrollToCommentsTop(true);
                                          }}
                                          style={styles.replyInlineAction}
                                        >
                                          <Text style={styles.replyActionText}>回复</Text>
                                        </Pressable>
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                              <Pressable onPress={() => handleExpandReplies(comment.id)}>
                                <Text style={styles.expandRepliesBtnText}>收起回复</Text>
                              </Pressable>
                            </>
                          ) : (
                            <Pressable onPress={() => handleExpandReplies(comment.id)} disabled={loading}>
                              {loading ? <ActivityIndicator size="small" color="#8A4B38" /> : <Text style={styles.expandRepliesBtnText}>展开 {comment.replyCount} 条回复</Text>}
                            </Pressable>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}

              {commentsData?.canView && commentCount > 0 ? (
                <View style={styles.commentsEndNotice}>
                  <Text style={styles.commentsEndNoticeText}>已经到底了</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            style={[
              styles.bottomComposer,
              isComposerExpanded && styles.bottomComposerFloating,
              {
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 10),
                bottom: isComposerExpanded ? Math.max(keyboardHeight, 0) : 0,
              },
            ]}
          >
            {isComposerExpanded ? (
              <>
                {replyingTo ? (
                  <View style={styles.replyingBanner}>
                    <Text style={styles.replyingBannerText}>回复 @{replyingTo.userName}</Text>
                    <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                      <IconSymbol name="xmark" size={16} color="#8C877F" />
                    </Pressable>
                  </View>
                ) : null}

                {commentImages.length > 0 ? (
                  <View style={styles.composerImagePreviewRow}>
                    {commentImages.map((uri, index) => (
                      <View key={`${uri}-${index}`} style={styles.composerImagePreviewWrap}>
                        <Image source={{ uri }} style={styles.composerImagePreview} contentFit="cover" />
                        <Pressable style={styles.composerImageRemoveBtn} onPress={() => removeCommentImage(index)} hitSlop={8}>
                          <IconSymbol name="xmark.circle.fill" size={18} color="#6B7280" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.composerExpandedCard}>
                  <TextInput
                    ref={inputRef}
                    style={styles.composerExpandedInput}
                    placeholder={user ? "有话要说，快来评论" : "登录后可以评论"}
                    placeholderTextColor="#B0AAA2"
                    value={commentText}
                    onChangeText={setCommentText}
                    editable={!!user}
                    multiline
                    autoFocus
                    maxLength={500}
                  />
                  <View style={styles.composerExpandedActions}>
                    <Pressable
                      onPress={pickCommentImage}
                      disabled={!user || commentImages.length >= 2 || commentUploading || createCommentMutation.isPending}
                      style={[styles.composerActionIconBtn, (!user || commentImages.length >= 2 || commentUploading || createCommentMutation.isPending) && styles.circleButtonDisabled]}
                    >
                      {commentUploading ? (
                        <ActivityIndicator size="small" color="#8A4B38" />
                      ) : (
                        <IconSymbol name="photo.fill" size={20} color={user && commentImages.length < 2 ? "#8A4B38" : "#B0AAA2"} />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={handleSubmitComment}
                      disabled={!canSendComment}
                      style={[styles.sendTextButton, canSendComment ? styles.sendTextButtonActive : styles.sendTextButtonDisabled]}
                    >
                      {createCommentMutation.isPending ? <ActivityIndicator size="small" color="#FFF7EE" /> : <Text style={styles.sendTextButtonLabel}>发送</Text>}
                    </Pressable>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.composerCollapsedRow}>
                <Pressable style={styles.composerCollapsedInput} onPress={() => scrollToCommentsTop(true)}>
                  <IconSymbol name="square.and.pencil" size={18} color="#8C877F" />
                  <Text style={styles.composerCollapsedPlaceholder}>说点什么...</Text>
                </Pressable>
                <Pressable onPress={handleToggleFavorite} disabled={toggleFavoriteMutation.isPending} style={styles.composerMetaBtn}>
                  {toggleFavoriteMutation.isPending ? <ActivityIndicator size="small" color="#8A4B38" /> : <IconSymbol name={isFavorited ? "heart.fill" : "heart"} size={22} color={isFavorited ? "#C85C3C" : "#5D5147"} />}
                  <Text style={styles.composerMetaText}>{favoriteCountData?.count ?? 0}</Text>
                </Pressable>
                <Pressable onPress={() => scrollToCommentsTop(false)} style={styles.composerMetaBtn}>
                  <IconSymbol name="bubble.left" size={22} color="#5D5147" />
                  <Text style={styles.composerMetaText}>{commentCount}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { backgroundColor: "#FFFFFF" },
  loadingText: { marginTop: 12, fontSize: 15, color: "#7A6C61" },
  scrollContent: { paddingTop: 8, paddingBottom: 220 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 14 },
  headerIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  headerBackText: { fontSize: 34, lineHeight: 34, color: "#27211B", marginTop: -2 },
  headerIdentity: { flexDirection: "row", alignItems: "center", flex: 1, marginLeft: 8 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#F3E7D8", alignItems: "center", justifyContent: "center" },
  headerAvatarPlaceholder: { fontSize: 18, fontWeight: "700", color: "#8A4B38" },
  headerIdentityText: { marginLeft: 12 },
  headerName: { fontSize: 16, fontWeight: "400", color: "#27211B" },
  headerSpacer: { width: 42 },
  sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#ECE7E0", marginHorizontal: 18 },
  heroCard: { position: "relative", overflow: "hidden", backgroundColor: "#E9DFCF", minHeight: 320 },
  heroImage: { width: "100%", height: 320 },
  heroImageFallback: { height: 320, backgroundColor: "#E5D7C1" },
  section: { paddingHorizontal: 18, paddingVertical: 18, gap: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center" },
  sectionTitle: { fontSize: 24, fontWeight: "800", color: "#27211B" },
  sectionMeta: { fontSize: 13, color: "#8C877F" },
  sectionMetaLarge: { fontSize: 16, fontWeight: "600", color: "#27211B" },
  resultList: { gap: 14 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  resultThumbWrap: { width: 58, height: 58, position: "relative" },
  resultThumb: { width: 58, height: 58, borderRadius: 16 },
  rankDot: { position: "absolute", top: -5, right: -5, width: 22, height: 22, borderRadius: 11, backgroundColor: "#F0E3D0", alignItems: "center", justifyContent: "center" },
  rankDotLeader: { backgroundColor: "#C85C3C" },
  rankDotText: { fontSize: 11, fontWeight: "800", color: "#8A4B38" },
  rankDotTextLeader: { color: "#FFF8EF" },
  resultMain: { flex: 1, gap: 8 },
  resultLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultLabel: { fontSize: 14, fontWeight: "600", color: "#544A42" },
  resultValue: { fontSize: 16, fontWeight: "800", color: "#27211B" },
  resultTrack: { height: 10, borderRadius: 999, backgroundColor: "#EFE4D6", overflow: "hidden" },
  resultFill: { height: "100%", borderRadius: 999 },
  resultFillLeader: { backgroundColor: "#C85C3C" },
  resultFillDefault: { backgroundColor: "#D8A28F" },
  resultVotes: { width: 42, textAlign: "right", fontSize: 13, color: "#8C877F" },
  detailTitle: { fontSize: 18, lineHeight: 28, fontWeight: "400", color: "#27211B" },
  detailDescription: { fontSize: 16, lineHeight: 25, color: "#5D5147" },
  detailMetaRow: { display: "none" },
  detailMetaText: { fontSize: 13, color: "#8C877F" },
  commentNotice: { paddingVertical: 8, gap: 6 },
  commentNoticeTitle: { fontSize: 16, fontWeight: "700", color: "#3A312B" },
  commentNoticeText: { fontSize: 13, lineHeight: 20, color: "#8C877F" },
  commentsEndNotice: { paddingTop: 4, paddingBottom: 8, alignItems: "center" },
  commentsEndNoticeText: { fontSize: 12, color: "#B0AAA2" },
  commentCard: { paddingVertical: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ECE7E0" },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  commentIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  commentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#D8C9B7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  commentAvatarText: { fontSize: 12, fontWeight: "800", color: "#5A4B3D" },
  commentIdentityText: { marginLeft: 10, flex: 1, gap: 2 },
  commentNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  commentName: { fontSize: 15, fontWeight: "700", color: "#27211B" },
  authorText: { fontSize: 12, color: "#C85C3C" },
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
  bottomComposer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "rgba(255,255,255,0.98)", borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  bottomComposerFloating: { position: "absolute", left: 0, right: 0, zIndex: 20, elevation: 20 },
  replyingBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, backgroundColor: "#F5E9DA", paddingHorizontal: 12, paddingVertical: 8 },
  replyingBannerText: { fontSize: 12, fontWeight: "700", color: "#8A4B38" },
  composerCollapsedRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  composerCollapsedInput: { flex: 1, height: 42, borderRadius: 22, backgroundColor: "#F4F1EC", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  composerCollapsedPlaceholder: { fontSize: 15, color: "#9C948B" },
  composerMetaBtn: { minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  composerMetaText: { fontSize: 15, fontWeight: "600", color: "#3E342D" },
  composerImagePreviewRow: { flexDirection: "row", gap: 10 },
  composerImagePreviewWrap: { position: "relative" },
  composerImagePreview: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#EDE7E0" },
  composerImageRemoveBtn: { position: "absolute", top: -6, right: -6, backgroundColor: "#FFFFFF", borderRadius: 10 },
  composerExpandedCard: { borderRadius: 24, backgroundColor: "#F4F1EC", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 },
  composerExpandedInput: { minHeight: 72, maxHeight: 120, fontSize: 15, lineHeight: 22, color: "#2F2822", textAlignVertical: "top", paddingTop: 0, paddingBottom: 0 },
  composerExpandedActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composerActionIconBtn: { minWidth: 56, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7CFC5", backgroundColor: "#FFFDFC" },
  circleButtonDisabled: { opacity: 0.45 },
  sendTextButton: { minWidth: 84, height: 40, borderRadius: 20, backgroundColor: "#F3B7C2", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  sendTextButtonActive: { backgroundColor: "#E97F98" },
  sendTextButtonDisabled: { backgroundColor: "#E7D4D8" },
  sendTextButtonLabel: { fontSize: 16, fontWeight: "700", color: "#FFF7EE" },
});
