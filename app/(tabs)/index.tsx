import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Image as RNImage, Dimensions, ActivityIndicator, Modal, Platform, Alert, TextInput, KeyboardAvoidingView, ScrollView as RNScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import { getApiBaseUrl } from "@/constants/oauth";
import * as MediaLibrary from "expo-media-library";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { captureRef } from "react-native-view-shot";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView as GHScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SwipeGuideModal } from "@/components/SwipeGuideModal";
import { VoteCardStack } from "@/components/vote-card-stack";

const shareIcon = require("@/assets/images/share-icon.png");

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.08;
const BATCH_SIZE = 50;
const QUEUE_MAX = 200;
const QUEUE_KEEP = 50;
const REFILL_THRESHOLD = 5;
const INITIAL_FETCH_TIMEOUT_MS = 12000;

/** "YYYY-MM-DD" -> "YYYY年M月D日" */
function formatVoteDate(voteDate: string): string {
  const [y, m, d] = voteDate.split("-");
  if (!y || !m || !d) return voteDate;
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  return `${y}年${month}月${day}日`;
}

interface VoteCardData {
  id: number;
  title?: string | null;
  photos: { id: number; url: string; photoIndex: number; voteCount: number }[];
  totalVotes: number;
}

export default function ImageTestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId?: string }>();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const requestedCardId = params.cardId ? parseInt(params.cardId, 10) : 0;

  const [currentCard, setCurrentCard] = useState<VoteCardData | null>(null);
  const [cardQueue, setCardQueue] = useState<VoteCardData[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [enableNextCardPreview, setEnableNextCardPreview] = useState(true);
  const [transitionPreviewCard, setTransitionPreviewCard] = useState<VoteCardData | null>(null);
  /** 本次会话所有已入队的卡片 ID，用于服务端排重 */
  const sessionQueueIdsRef = useRef<number[]>([]);
  const prefetchedImageUrlsRef = useRef<Set<string>>(new Set());
  const isRefillInProgress = useRef(false);
  const [previousCards, setPreviousCards] = useState<VoteCardData[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [voteResult, setVoteResult] = useState<{ percentage: number; voteCount: number; totalVotes: number } | null>(null);
  const [allPhotoStats, setAllPhotoStats] = useState<{ id: number; percentage: number; voteCount: number }[]>([]);
  const [userVotedAt, setUserVotedAt] = useState<string | null>(null); // voteDate "YYYY-MM-DD" 用于展示「某年某月某日参与投票」
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [commentImageUrls, setCommentImageUrls] = useState<string[]>([]);
  const [commentUploading, setCommentUploading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // 截图时临时隐藏分享按钮，避免按钮出现在截图中
  const [hideShareBtn, setHideShareBtn] = useState(false);
  const cardCaptureRef = useRef<View>(null);
  // 分享底部弹窗
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareThumbnail, setShareThumbnail] = useState<string | null>(null);

  // 全屏图片查看器：点击图片展开，横滑可查看同组其他图
  const [expandedPhotoIndex, setExpandedPhotoIndex] = useState<number | null>(null);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(0);
  const imageViewerScrollRef = useRef<RNScrollView>(null);

  const lastTapRef = useRef(0);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const showNextCard = useSharedValue(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useSharedValue(0);
  const toastTranslateY = useSharedValue(30);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnimatedStyle = useAnimatedStyle(() => ({
    opacity: toastOpacity.value,
    transform: [{ translateY: toastTranslateY.value }],
  }));
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastOpacity.value = withTiming(1, { duration: 220 });
    toastTranslateY.value = withSpring(0, { damping: 14, stiffness: 160 });
    toastTimeoutRef.current = setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 300 });
      toastTranslateY.value = withTiming(16, { duration: 300 });
    }, 2000);
  }, [toastOpacity, toastTranslateY]);

  const utils = trpc.useUtils();
  const { data: requestedCardData, isLoading: isRequestedCardLoading } = trpc.cards.getById.useQuery(
    { cardId: requestedCardId },
    { enabled: requestedCardId > 0 }
  );

  // ── 新手引导：仅保留首屏上滑翻页提示 ───────────────────────────────────
  const SWIPE_GUIDE_SHOWN_KEY = "@swipe_guide_shown_v1";
  const [showSwipeGuide, setShowSwipeGuide] = useState(false);
  const swipeGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedRequestedCardIdRef = useRef<number | null>(null);

  // 首屏「上滑翻页」指引：首次进入投票页 0.5~1 秒后显示，用户完成一次上滑后关闭
  useEffect(() => {
    if (!currentCard || showResult) return;
    if (swipeGuideTimerRef.current) clearTimeout(swipeGuideTimerRef.current);
    const delay = 500 + Math.random() * 500;
    swipeGuideTimerRef.current = setTimeout(() => {
      swipeGuideTimerRef.current = null;
      AsyncStorage.getItem(SWIPE_GUIDE_SHOWN_KEY).then((v) => {
        if (!v) setShowSwipeGuide(true);
      }).catch(() => {});
    }, delay);
    return () => {
      if (swipeGuideTimerRef.current) clearTimeout(swipeGuideTimerRef.current);
    };
  }, [currentCard?.id, showResult]);

  const handleSwipeGuideDismiss = useCallback(() => {
    setShowSwipeGuide(false);
    AsyncStorage.setItem(SWIPE_GUIDE_SHOWN_KEY, "1").catch(() => {});
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const fetchBatch = useCallback(
    async (excludeCardIds: number[]): Promise<VoteCardData[]> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("加载超时，请检查当前后端地址或网络连接")), INITIAL_FETCH_TIMEOUT_MS);
      });
      const batch = await Promise.race([
        utils.cards.getRandomForVotingBatch.fetch({
          count: BATCH_SIZE,
          excludeCardIds: excludeCardIds.length > 0 ? excludeCardIds : undefined,
        }),
        timeoutPromise,
      ]);
      const fetched = (batch as VoteCardData[]).filter((c) => c.photos && c.photos.length > 0);
      if (user) {
        fetched.forEach((card) => {
          utils.votes.myVoteResult.prefetch({ cardId: card.id }).catch(() => {});
        });
      }
      return fetched;
    },
    [utils.cards.getRandomForVotingBatch, utils.votes.myVoteResult, user]
  );

  /**
   * 从服务端拉取一批新卡片，追加到会话队列。
   *
   * isInitial=false（后台补充）：
   *   服务端返 0 → 静默忽略，display buffer 里还有卡，等自然耗尽再重置
   *
   * isInitial=true（buffer 已空，用户无牌可看）：
   *   服务端返 0 → 此时才清空 sessionQueueIds 并重新拉取，开始新一轮循环
   *   使用函数式更新，避免与 back-swipe 竞争覆盖已恢复的卡片
   */
  const performRefill = useCallback(
    async (isInitial: boolean) => {
      if (isRefillInProgress.current) return;
      isRefillInProgress.current = true;
      if (isInitial) {
        setQueueLoading(true);
        setQueueError(null);
      }

      try {
        let batch = await fetchBatch([...sessionQueueIdsRef.current]);

        if (batch.length === 0 && isInitial) {
          // buffer 已空且无新卡 → 清空会话，重新开始循环
          sessionQueueIdsRef.current = [];
          batch = await fetchBatch([]);
        }

        if (batch.length > 0) {
          sessionQueueIdsRef.current = [
            ...sessionQueueIdsRef.current,
            ...batch.map((c) => c.id),
          ];
          // 超出 200 时保留最新 50 个（它们正好在 display buffer 里）
          if (sessionQueueIdsRef.current.length >= QUEUE_MAX) {
            sessionQueueIdsRef.current = sessionQueueIdsRef.current.slice(-QUEUE_KEEP);
          }

          if (isInitial) {
            // 函数式更新：若用户已 back-swipe 恢复了卡片，则不覆盖
            setCurrentCard((prev) => (prev !== null ? prev : batch[0] ?? null));
            setCardQueue((prev) => (prev.length > 0 ? prev : batch.slice(1)));
          } else {
            setCardQueue((prev) => [...prev, ...batch]);
          }
        }
      } catch (e) {
        console.error("Refill failed:", e);
        const message = e instanceof Error ? e.message : "卡片加载失败，请稍后重试";
        setQueueError(message);
      } finally {
        isRefillInProgress.current = false;
        if (isInitial) setQueueLoading(false);
      }
    },
    [fetchBatch]
  );

  const resetCardViewState = useCallback(() => {
    setEnableNextCardPreview(false);
    setTransitionPreviewCard(null);
    setShowResult(false);
    setVoteResult(null);
    setUserVotedAt(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setCommentImages([]);
    setCommentImageUrls([]);
    setIsFavorited(false);
    setExpandedPhotoIndex(null);
    cardOpacity.value = 1;
    showNextCard.value = false;
    translateY.value = 0;
    requestAnimationFrame(() => setEnableNextCardPreview(true));
  }, [cardOpacity, showNextCard, translateY]);

  useEffect(() => {
    if (requestedCardId <= 0) {
      appliedRequestedCardIdRef.current = null;
      return;
    }
    if (!requestedCardData) return;
    if (appliedRequestedCardIdRef.current === requestedCardId) return;

    appliedRequestedCardIdRef.current = requestedCardId;
    resetCardViewState();
    setPreviousCards([]);
    setCurrentCard(requestedCardData as VoteCardData);
    setCardQueue((prev) => prev.filter((card) => card.id !== requestedCardId));
    sessionQueueIdsRef.current = [
      requestedCardId,
      ...sessionQueueIdsRef.current.filter((id) => id !== requestedCardId),
    ];
  }, [requestedCardData, requestedCardId, resetCardViewState]);

  useEffect(() => {
    if (requestedCardId > 0 && appliedRequestedCardIdRef.current !== requestedCardId && isRequestedCardLoading) {
      return;
    }
    if (currentCard || cardQueue.length > 0 || isTransitioning) return;
    performRefill(true);
  }, [currentCard, cardQueue.length, isTransitioning, performRefill, requestedCardId, isRequestedCardLoading]);

  const prefetchUpcomingCardImages = useCallback(async (cards: VoteCardData[]) => {
    const urls = cards
      .flatMap((card) => card.photos)
      .map((photo) => getImageUrl(photo.url))
      .filter((url) => !!url && !prefetchedImageUrlsRef.current.has(url));

    if (urls.length === 0) return;

    urls.forEach((url) => prefetchedImageUrlsRef.current.add(url));

    try {
      await Image.prefetch(urls);
    } catch (error) {
      console.warn("[vote-flow] image prefetch failed", error);
      urls.forEach((url) => prefetchedImageUrlsRef.current.delete(url));
    }
  }, []);

  useEffect(() => {
    if (cardQueue.length === 0) return;
    prefetchUpcomingCardImages(cardQueue.slice(0, 3));
  }, [cardQueue, prefetchUpcomingCardImages]);

  const submitVoteMutation = trpc.votes.submit.useMutation({
    onSuccess: (data, variables) => {
      // data.photoId 已包含正确的投票照片（无论是本次新投还是已有记录）
      const votedPhotoId = data.photoId;
      setSelectedPhotoId(votedPhotoId);
      if (currentCard) {
        const stats = data.photoStats ?? currentCard.photos.map((photo) => {
          const isSelected = photo.id === votedPhotoId;
          const voteCount = isSelected ? data.voteCount : photo.voteCount;
          const percentage = data.totalVotes > 0 ? Math.round((voteCount / data.totalVotes) * 100) : 0;
          return { id: photo.id, percentage, voteCount };
        });
        setAllPhotoStats(stats);
        // 同步更新 myVoteResult 缓存，确保返回此卡片时直接命中
        utils.votes.myVoteResult.setData(
          { cardId: variables.cardId },
          {
            photoId: votedPhotoId,
            voteCount: data.voteCount,
            percentage: data.percentage,
            totalVotes: data.totalVotes,
            photoStats: stats,
            voteDate: data.voteDate,
            createdAt: new Date(),
          }
        );
      }
      setVoteResult({ percentage: data.percentage, voteCount: data.voteCount, totalVotes: data.totalVotes });
      setUserVotedAt(data.voteDate);
      setShowResult(true);
      setShowComments(false);
      router.replace(`/result?cardId=${variables.cardId}`);
    },
    onError: (error) => {
      console.error("Vote error:", error);
      goToNextCard();
    },
  });

  // 查询当前用户是否已对这张卡投过票
  const { data: myVoteResultData, isLoading: isCheckingVote } = trpc.votes.myVoteResult.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user }
  );

  const applyPreviousVoteResult = useCallback(
    (data: NonNullable<typeof myVoteResultData>) => {
      setSelectedPhotoId(data.photoId);
      setAllPhotoStats(data.photoStats);
      setVoteResult({ percentage: data.percentage, voteCount: data.voteCount, totalVotes: data.totalVotes });
      setUserVotedAt(data.voteDate);
      setShowResult(true);
      setShowComments(false);
    },
    []
  );


  const { data: commentsData, refetch: refetchComments } = trpc.comments.getByCardId.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user && showResult }
  );

  const { data: favoriteData, refetch: refetchFavorite } = trpc.favorites.check.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user && showResult }
  );

  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onSuccess: (data) => {
      setIsFavorited(data.isFavorited);
    },
    onError: (error) => {
      console.error("Favorite error:", error);
    },
  });

  useEffect(() => {
    if (favoriteData) {
      setIsFavorited(favoriteData.isFavorited);
    }
  }, [favoriteData]);

  const createCommentMutation = trpc.comments.create.useMutation({
    onSuccess: () => {
      setCommentText("");
      setCommentImages([]);
      setCommentImageUrls([]);
      refetchComments();
    },
    onError: (error) => {
      console.error("Comment error:", error);
      Alert.alert("发送失败", error.message || "请稍后重试");
    },
  });

  const pickCommentImage = useCallback(async () => {
    if (commentImages.length >= 2) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 1,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCommentUploading(true);
      try {
        // 压缩后立即上传拿 URL，tRPC 发评论时只传 URL
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
        setCommentImageUrls((prev) => [...prev, json.url!]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "图片上传失败，请重试";
        Alert.alert("上传失败", msg);
      } finally {
        setCommentUploading(false);
      }
    }
  }, [commentImages.length]);

  const removeCommentImage = useCallback((index: number) => {
    setCommentImages((prev) => prev.filter((_, i) => i !== index));
    setCommentImageUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmitComment = useCallback(() => {
    const hasText = !!commentText.trim();
    const hasImages = commentImageUrls.length > 0;
    if (!hasText && !hasImages) return;
    if (commentUploading) return;
    if (!currentCard) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后评论");
      else Alert.alert("提示", "请先登录后评论", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }
    createCommentMutation.mutate({
      cardId: currentCard.id,
      content: commentText.trim(),
      imageUrls: commentImageUrls.length > 0 ? commentImageUrls : undefined,
    });
  }, [commentText, commentImages, commentImageUrls, commentUploading, currentCard, createCommentMutation, user, router]);

  const handleToggleFavorite = useCallback(() => {
    if (!currentCard) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后收藏");
      else Alert.alert("提示", "请先登录后收藏", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }
    toggleFavoriteMutation.mutate({ cardId: currentCard.id });
  }, [currentCard, toggleFavoriteMutation, user, router]);

  // 点击分享按钮：截图后展示分享底部弹窗
  const handleOpenShareSheet = useCallback(async () => {
    if (!currentCard || isSharing) return;
    setIsSharing(true);
    try {
      setHideShareBtn(true);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const uri = await captureRef(cardCaptureRef, { format: "jpg", quality: 0.85, result: "tmpfile" });
      setHideShareBtn(false);
      setShareThumbnail(uri);
      setShowShareSheet(true);
    } catch (e) {
      setHideShareBtn(false);
      console.error("[share] 截图失败:", e);
      Alert.alert("截图失败", "截图时出现错误，请稍后重试。");
    } finally {
      setIsSharing(false);
    }
  }, [currentCard, isSharing]);

  const closeShareSheet = useCallback(() => setShowShareSheet(false), []);

  // 分享到小红书：保存截图到相册 → 跳转小红书发布页
  const shareToXiaohongshu = useCallback(async () => {
    closeShareSheet();
    if (!shareThumbnail) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("需要相册权限", "请在设置中允许「一选」访问您的相册。");
        return;
      }
      await MediaLibrary.saveToLibraryAsync(shareThumbnail);
      const xhsScheme = "xhsdiscover://post";
      const canOpen = await Linking.canOpenURL(xhsScheme);
      if (!canOpen) {
        Alert.alert("截图已保存", "请打开小红书 App，从相册选择刚保存的图片发布笔记。");
        return;
      }
      try {
        await Linking.openURL(xhsScheme);
      } catch {
        Alert.alert("截图已保存", "未能自动打开小红书，请从相册选择刚保存的图片发布笔记。");
      }
    } catch {
      Alert.alert("分享失败", "请稍后重试。");
    }
  }, [shareThumbnail, closeShareSheet]);

  // 复制分享文字 + 链接到剪贴板
  const copyShareLink = useCallback(async () => {
    closeShareSheet();
    if (!currentCard) return;
    const base = getApiBaseUrl();
    const url = `${base}/share/card/${currentCard.id}`;
    const title = currentCard.title || "有趣的投票";
    const text = `${title} ${url} \n复制后打开【一选】参与投票！`;
    await Clipboard.setStringAsync(text);
    showToast("链接已复制到剪贴板");
  }, [currentCard, closeShareSheet]);

  const handleSelectPhoto = useCallback(
    (photoId: number) => {
      if (selectedPhotoId !== null || !currentCard) return;
      // 等待已投票检查完成，避免竞态
      if (isCheckingVote) return;
      if (!user) {
        if (Platform.OS === "web") window.alert("请先登录后再投票");
        else Alert.alert("提示", "请先登录后再投票", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
        return;
      }
      // 已有投票记录：直接展示原有结果，忽略本次选择
      if (myVoteResultData) {
        applyPreviousVoteResult(myVoteResultData);
        router.replace(`/result?cardId=${currentCard.id}`);
        return;
      }
      setSelectedPhotoId(photoId);
      submitVoteMutation.mutate({
        cardId: currentCard.id,
        photoId,
      });
    },
    [selectedPhotoId, currentCard, isCheckingVote, myVoteResultData, applyPreviousVoteResult, submitVoteMutation, user, router]
  );

  // 全屏查看打开时滚动到对应索引
  useEffect(() => {
    if (expandedPhotoIndex === null || !currentCard?.photos.length) return;
    const timer = setTimeout(() => {
      imageViewerScrollRef.current?.scrollTo({
        x: expandedPhotoIndex * SCREEN_WIDTH,
        animated: false,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [expandedPhotoIndex, currentCard?.photos.length]);

  const handlePhotoPress = useCallback(
    (photoId: number, photoIndex: number) => {
      const now = Date.now();
      if (now - lastTapRef.current < 400 && singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
        lastTapRef.current = 0;
        setViewingPhotoIndex(photoIndex);
        setExpandedPhotoIndex(photoIndex);
        return;
      }
      lastTapRef.current = now;
      singleTapTimeoutRef.current = setTimeout(() => {
        handleSelectPhoto(photoId);
        singleTapTimeoutRef.current = null;
      }, 300);
    },
    [handleSelectPhoto]
  );

  const resetAndFetchNext = useCallback(() => {
    const promotedCard = cardQueue[0] ?? null;
    setEnableNextCardPreview(false);
    setTransitionPreviewCard(promotedCard);
    setShowResult(false);
    setVoteResult(null);
    setUserVotedAt(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setCommentImages([]);
    setCommentImageUrls([]);
    setIsFavorited(false);
    setExpandedPhotoIndex(null);
    cardOpacity.value = 1;

    if (currentCard) {
      setPreviousCards((prev) => [...prev, currentCard]);
    }

    if (cardQueue.length > 0) {
      const [next, ...rest] = cardQueue;
      setCurrentCard(next);
      setCardQueue(rest);
      // 队列剩余不足阈值时后台预拉下一批
      if (rest.length < REFILL_THRESHOLD) {
        performRefill(false);
      }
    } else {
      // 队列已空，useEffect 会触发 performRefill(true)
      setCurrentCard(null);
    }

    requestAnimationFrame(() => {
      translateY.value = 0;
      requestAnimationFrame(() => {
        showNextCard.value = false;
        setTransitionPreviewCard(null);
      });
    });

    setTimeout(() => {
      setEnableNextCardPreview(true);
      setIsTransitioning(false);
    }, 80);
  }, [cardQueue, currentCard, performRefill, showNextCard, translateY, cardOpacity]);

  const resetAndShowPrevious = useCallback(() => {
    setEnableNextCardPreview(false);
    setTransitionPreviewCard(null);
    setShowResult(false);
    setVoteResult(null);
    setUserVotedAt(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setIsFavorited(false);
    setExpandedPhotoIndex(null);
    cardOpacity.value = 1;
    showNextCard.value = false;

    setPreviousCards((prev) => {
      if (prev.length === 0) return prev;
      const newPrev = [...prev];
      const previousCard = newPrev.pop()!;
      setCardQueue((queue) => (currentCard ? [currentCard, ...queue] : queue));
      setCurrentCard(previousCard);
      return newPrev;
    });

    requestAnimationFrame(() => {
      translateY.value = 0;
    });

    setTimeout(() => {
      setEnableNextCardPreview(true);
      setIsTransitioning(false);
    }, 80);
  }, [currentCard, showNextCard, translateY, cardOpacity]);

  const goToNextCard = useCallback(() => {
    if (showSwipeGuide) {
      handleSwipeGuideDismiss();
    }
    setIsTransitioning(true);
    resetAndFetchNext();
  }, [resetAndFetchNext, showSwipeGuide, handleSwipeGuideDismiss]);

  const goToPreviousCard = useCallback(() => {
    if (previousCards.length === 0 || isTransitioning) return;
    setIsTransitioning(true);
    resetAndShowPrevious();
  }, [previousCards.length, isTransitioning, resetAndShowPrevious]);

  const canGoBack = previousCards.length > 0;
  const showQueueError = !currentCard && !queueLoading && !isTransitioning && !!queueError;
  const showEmpty =
    !currentCard &&
    !queueLoading &&
    !isTransitioning &&
    !queueError &&
    previousCards.length === 0;
  const showLoading = !currentCard && (queueLoading || isTransitioning);
  const canSwipePrev = canGoBack;
  const canSwipeNext = !!currentCard && !(showResult && showComments);
  const nextCard = !showResult
    ? (transitionPreviewCard ?? (enableNextCardPreview ? cardQueue[0] ?? null : null))
    : null;
  const totalCount = previousCards.length + (currentCard ? 1 : 0) + cardQueue.length;
  const currentIndex = currentCard ? previousCards.length + 1 : 0;
  const progressPct = totalCount > 0 ? Math.min(100, Math.round((currentIndex / totalCount) * 100)) : 0;

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(true)
        .onUpdate((event) => {
          const dragY = event.translationY;
          const isNextDirection = dragY < 0;
          const isPrevDirection = dragY > 0;
          const allowMove =
            (isPrevDirection && canSwipePrev) ||
            (isNextDirection && canSwipeNext);
          // 禁止方向直接锁死，避免出现“可拉动但过不去”
          showNextCard.value = allowMove && isNextDirection;
          translateY.value = allowMove ? dragY : 0;
        })
        .onEnd((event) => {
          const toNext = event.translationY <= -SWIPE_THRESHOLD && canSwipeNext;
          const toPrev = event.translationY >= SWIPE_THRESHOLD && canSwipePrev;
          if (toPrev) {
            showNextCard.value = false;
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, () => {
              runOnJS(goToPreviousCard)();
            });
          } else if (toNext) {
            showNextCard.value = true;
            translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200 }, () => {
              runOnJS(goToNextCard)();
            });
          } else {
            showNextCard.value = false;
            translateY.value = 0;
          }
        })
        .runOnJS(true),
    [canSwipePrev, canSwipeNext, goToNextCard, goToPreviousCard, showNextCard, translateY]
  );

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: cardOpacity.value,
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View ref={cardCaptureRef} collapsable={false} style={styles.fullScreen}>
          <View style={styles.background} />

          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={{ flex: 1 }} />
            {!!currentCard && !hideShareBtn && Platform.OS !== "web" && (
              <Pressable
                onPress={handleOpenShareSheet}
                disabled={isSharing}
                style={styles.shareBtn}
                hitSlop={8}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
                ) : (
                  <RNImage source={shareIcon} style={styles.shareBtnIcon} resizeMode="contain" />
                )}
              </Pressable>
            )}
          </View>

          {showLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.stateText}>加载中...</Text>
            </View>
          ) : showQueueError ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{queueError}</Text>
              <Pressable onPress={() => performRefill(true)} style={styles.backToPrevBtn}>
                <Text style={styles.backToPrevText}>重新加载</Text>
              </Pressable>
            </View>
          ) : !currentCard && previousCards.length > 0 && !queueLoading && !isTransitioning ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>当前无新卡片</Text>
              <Pressable onPress={goToPreviousCard} style={styles.backToPrevBtn}>
                <Text style={styles.backToPrevText}>返回上一张</Text>
              </Pressable>
            </View>
          ) : showEmpty ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>暂无可展示图片</Text>
            </View>
          ) : (
            <View style={styles.content}>
              {!showResult ? (
                <VoteCardStack
                  currentCard={currentCard!}
                  nextCard={nextCard}
                  selectedPhotoId={selectedPhotoId}
                  onPhotoPress={handlePhotoPress}
                  translateY={translateY}
                  showNextCard={showNextCard}
                />
              ) : !showResult ? (
                <>
                  {(() => {
                    const t = currentCard?.title || "选择你喜欢的";
                    return (
                      <Text style={[styles.voteTitle, t.length > 8 && styles.voteTitleSmall]}>
                        {t}
                      </Text>
                    );
                  })()}
                  <Text style={styles.voteSubtitle}>单击投票，双击查看图片</Text>
                  {(() => {
                    const count = currentCard!.photos.length;
                    const renderCard = (photo: VoteCardData["photos"][number], style: any, photoIndex: number) => {
                      const isLast = photoIndex === count - 1;
                      return (
                        <View
                          key={photo.id}
                          style={[styles.photoCard, style]}
                        >
                          <Pressable
                            onPress={() => handlePhotoPress(photo.id, photoIndex)}
                            disabled={selectedPhotoId !== null}
                            style={styles.photoCardPressable}
                          >
                            <View style={styles.photoImageWrap}>
                              <RNImage
                                source={{ uri: getImageUrl(photo.url) }}
                                style={styles.photoImage}
                                resizeMode="cover"
                                onError={(e) => {
                                  console.warn("[vote-flow] image load failed", {
                                    photoId: photo.id,
                                    url: getImageUrl(photo.url),
                                    error: e?.nativeEvent?.error,
                                  });
                                }}
                              />
                            </View>
                          </Pressable>
                        </View>
                      );
                    };

                    if (count === 4) {
                      const rows = [
                        currentCard!.photos.slice(0, 2),
                        currentCard!.photos.slice(2, 4),
                      ];
                      return (
                        <View style={styles.photoBlockOffset}><View style={styles.photosGridTwoColumn}>
                          {rows.map((row, rowIndex) => (
                            <View key={`row-${rowIndex}`} style={styles.photoRow}>
                              {row.map((photo) => renderCard(photo, styles.photoCardGrid, currentCard!.photos.indexOf(photo)))}
                            </View>
                          ))}
                        </View></View>
                  );
                    }

                    if (count === 3) {
                      const firstRow = currentCard!.photos.slice(0, 2);
                      const secondRow = currentCard!.photos.slice(2, 3);
                      return (
                        <View style={styles.photoBlockOffset}><View style={styles.photosGridTwoColumn}>
                          <View style={styles.photoRow}>
                            {firstRow.map((photo) => renderCard(photo, styles.photoCardGrid, currentCard!.photos.indexOf(photo)))}
                          </View>
                          <View style={styles.photoRowCenter}>
                            {secondRow.map((photo) => renderCard(photo, styles.photoCardGrid, currentCard!.photos.indexOf(photo)))}
                          </View>
                        </View></View>
                  );
                    }

                    return (
                      <View style={count === 2 ? styles.photoBlockOffsetTwo : styles.photoBlockOffset}>
                        <View style={[styles.photosGrid, styles.photosGridSingleColumn]}>
                          {currentCard!.photos.map((photo, idx) =>
                            renderCard(photo, count === 2 ? styles.photoCardLarge : styles.photoCardFull, idx)
                          )}
                        </View>
                      </View>
                    );
                  })()}
                </>
              ) : (
                <>
                  <Text style={styles.voteTitle}>投票结果</Text>
                  {userVotedAt ? (
                    <Text style={styles.voteDateSubtitle}>
                      {formatVoteDate(userVotedAt)}参与投票
                    </Text>
                  ) : null}
                  {showComments ? <Text style={styles.voteSubtitle}>点击关闭评论区</Text> : null}
                  <View style={styles.resultsList}>
                    {currentCard!.photos.map((photo) => {
                      const stats = allPhotoStats.find((s) => s.id === photo.id);
                      const isSelected = photo.id === selectedPhotoId;
                      const percentage = stats?.percentage ?? 0;
                      const voteCount = stats?.voteCount ?? photo.voteCount;
                      return (
                        <View
                          key={photo.id}
                          style={[styles.resultItem, isSelected && styles.resultItemSelected]}
                        >
                          <Image
                            source={{ uri: getImageUrl(photo.url) }}
                            style={styles.resultPhoto}
                            contentFit="cover"
                          />
                          <View style={styles.resultStats}>
                            <View style={styles.resultHeader}>
                              <Text style={styles.resultPercentage}>{percentage}%</Text>
                              <Text style={styles.uploadOrderText}>上传第 {photo.photoIndex + 1} 张</Text>
                              {isSelected && (
                                <View style={styles.yourChoiceBadge}>
                                  <Text style={styles.yourChoiceText}>你的选择</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.resultVotes}>{voteCount} 票</Text>
                            <View style={styles.resultBar}>
                              <View
                                style={[
                                  styles.resultBarFill,
                                  { width: `${percentage}%` },
                                  isSelected && styles.resultBarFillSelected,
                                ]}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.totalVotes}>共 {voteResult?.totalVotes ?? 0} 人参与投票</Text>
                  <View style={styles.actionButtonsRow}>
                    <Pressable
                      onPress={handleToggleFavorite}
                      disabled={toggleFavoriteMutation.isPending}
                      style={[styles.actionButton, isFavorited && styles.actionButtonActive]}
                    >
                      <IconSymbol
                        name={isFavorited ? "heart.fill" : "heart"}
                        size={20}
                        color={isFavorited ? "#EF4444" : "#6366F1"}
                      />
                      <Text style={[styles.actionButtonText, isFavorited && styles.actionButtonTextActive]}>
                        {isFavorited ? "已收藏" : "收藏"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowComments(!showComments)}
                      style={[styles.actionButton, showComments && styles.actionButtonActive]}
                    >
                      <IconSymbol name="bubble.left.fill" size={20} color="#6366F1" />
                      <Text style={styles.actionButtonText}>
                        {showComments ? "收起" : "查看"}评论
                        {commentsData?.comments.length ? ` (${commentsData.comments.length})` : ""}
                      </Text>
                    </Pressable></View>
                </>
              )}
            </View>
          )}
          <Modal
            visible={!!currentCard && showComments && !!(commentsData?.canView)}
            transparent
            animationType="slide"
            onRequestClose={() => setShowComments(false)}
          >
            <Pressable style={styles.drawerOverlay} onPress={() => setShowComments(false)}>
              <Pressable
                style={[styles.commentsDrawer, { paddingBottom: insets.bottom + 16 }]}
                onPress={() => {}}
              >
                <Pressable style={styles.drawerHandleWrap} onPress={() => {}}>
                  <View style={styles.drawerHandle} />
                </Pressable>
                <View style={styles.drawerHeader}>
                  <Text style={styles.drawerTitle}>评论区</Text>
                  <Pressable onPress={() => setShowComments(false)} style={styles.drawerCloseBtn} hitSlop={12}>
                    <IconSymbol name="xmark.circle.fill" size={28} color="#9CA3AF" />
                  </Pressable>
                </View>
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : "height"}
                  style={styles.drawerBody}
                >
                  {commentImages.length > 0 && (
                    <View style={styles.drawerImagePreviewRow}>
                      {commentImages.map((uri, idx) => (
                        <View key={idx} style={styles.drawerImagePreviewWrap}>
                          <Image source={{ uri }} style={styles.drawerImagePreview} contentFit="cover" />
                          <Pressable
                            style={styles.drawerImageRemoveBtn}
                            onPress={() => removeCommentImage(idx)}
                            hitSlop={8}
                          >
                            <IconSymbol name="xmark.circle.fill" size={18} color="#6B7280" />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.drawerInputRow}>

                    <TextInput
                      style={styles.drawerInput}
                      placeholder={user ? "写下你的想法..." : "请先登录后评论"}
                      placeholderTextColor="#9CA3AF"
                      value={commentText}
                      onChangeText={setCommentText}
                      multiline
                      maxLength={500}
                      editable={!!user}
                    />
                    <View style={styles.drawerInputActions}>
                      <Pressable
                        onPress={pickCommentImage}
                        disabled={!user || commentImages.length >= 2 || commentUploading}
                        style={[styles.drawerImageBtn, (!user || commentImages.length >= 2 || commentUploading) && styles.drawerImageBtnDisabled]}
                        hitSlop={4}
                      >
                        {commentUploading
                          ? <ActivityIndicator size={16} color="#6366F1" />
                          : <IconSymbol name="photo.fill" size={20} color={user && commentImages.length < 2 ? "#6366F1" : "#D1D5DB"} />
                        }
                      </Pressable>
                      <Pressable
                        onPress={handleSubmitComment}
                        disabled={!user || (!commentText.trim() && commentImageUrls.length === 0) || createCommentMutation.isPending || commentUploading}
                        style={[
                          styles.drawerSendBtn,
                          (!user || (!commentText.trim() && commentImageUrls.length === 0) || createCommentMutation.isPending || commentUploading) &&
                            styles.drawerSendBtnDisabled,
                        ]}
                      >
                        <Text style={[
                          styles.drawerSendBtnText,
                          (!user || (!commentText.trim() && commentImageUrls.length === 0) || createCommentMutation.isPending || commentUploading) &&
                            styles.drawerSendBtnTextDisabled,
                        ]}>发送</Text>
                      </Pressable>
                    </View>
                  </View>
                  <RNScrollView
                    style={styles.drawerCommentsList}
                    contentContainerStyle={styles.drawerCommentsContent}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {commentsData?.comments.length === 0 ? (
                      <Text style={styles.drawerNoComments}>暂无评论，来发表第一条吧~</Text>
                    ) : (
                      (commentsData?.comments ?? []).map((comment) => {
                        const card = currentCard;
                        const votedPhoto = comment.votedPhotoId != null
                          ? card?.photos.find((p) => p.id === comment.votedPhotoId)
                          : undefined;
                        const photoIndex =
                          votedPhoto && card
                            ? card.photos.findIndex((p) => p.id === comment.votedPhotoId)
                            : -1;
                        return (
                          <View key={comment.id} style={styles.drawerCommentItem}>
                            <View style={styles.drawerCommentAvatarWrap}>
                              {comment.userAvatarUrl ? (
                                <Image
                                  source={{ uri: getImageUrl(comment.userAvatarUrl) }}
                                  style={styles.drawerCommentAvatarPhoto}
                                  contentFit="cover"
                                />
                              ) : (
                                <View style={styles.drawerCommentAvatar}>
                                  <Text style={styles.drawerCommentAvatarText}>
                                    {comment.userName.slice(-2)}
                                  </Text>
                                </View>
                              )}
                              {votedPhoto && photoIndex >= 0 && (
                                <View style={styles.drawerPhotoNumBadge}>
                                  <Text style={styles.drawerPhotoNumText}>{photoIndex + 1}</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.drawerCommentBody}>
                              <View style={styles.drawerCommentRow}>
                                <Text style={styles.drawerCommentUser}>{comment.userName}</Text>
                                {votedPhoto && photoIndex >= 0 && (
                                  <View style={styles.drawerVoteBadge}>
                                    <IconSymbol name="checkmark.circle.fill" size={12} color="#6366F1" />
                                    <Text style={styles.drawerVoteBadgeText}>第 {photoIndex + 1} 张</Text>
                                  </View>
                                )}
                              </View>
                              {!!comment.content && (
                                <Text style={styles.drawerCommentContent}>{comment.content}</Text>
                              )}
                              {comment.images && comment.images.length > 0 && (
                                <View style={styles.drawerCommentImagesRow}>
                                  {comment.images.map((imgUrl, imgIdx) => (
                                    <Image
                                      key={imgIdx}
                                      source={{ uri: getImageUrl(imgUrl) }}
                                      style={styles.drawerCommentImage}
                                      contentFit="cover"
                                    />
                                  ))}
                                </View>
                              )}
                              <Text style={styles.drawerCommentTime}>
                                {new Date(comment.createdAt).toLocaleString("zh-CN", {
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </RNScrollView>
                </KeyboardAvoidingView>
              </Pressable>
            </Pressable>
          </Modal>
          {/* 全屏图片查看器：横滑可切换同组其他图，点击任意处关闭 */}
          <Modal
            visible={expandedPhotoIndex !== null && !!currentCard}
            transparent
            animationType="fade"
            onRequestClose={() => setExpandedPhotoIndex(null)}
          >
            <View style={styles.imageViewerOverlay}>
            <RNScrollView
              ref={imageViewerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.imageViewerScroll}
              contentContainerStyle={styles.imageViewerScrollContent}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setViewingPhotoIndex(Math.min(Math.max(0, index), (currentCard?.photos.length ?? 1) - 1));
              }}
              scrollEventThrottle={16}
            >
              {(currentCard?.photos ?? []).map((item) => (
                <Pressable key={item.id} style={styles.imageViewerPage} onPress={() => setExpandedPhotoIndex(null)}>
                  <Image
                    source={{ uri: getImageUrl(item.url) }}
                    style={styles.imageViewerImage}
                    contentFit="contain"
                  />
                </Pressable>
              ))}
            </RNScrollView>
            </View>
          </Modal>
        </Animated.View>
      </GestureDetector>

      {/* 分享底部弹窗（位于 GestureDetector 外，不受手势干扰） */}
      <Modal
        visible={showShareSheet}
        transparent
        animationType="slide"
        onRequestClose={closeShareSheet}
      >
        <Pressable style={styles.shareSheetOverlay} onPress={closeShareSheet}>
          <Pressable style={[styles.shareSheetContainer, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            {/* 拖拽把手 */}
            <View style={styles.shareSheetHandleWrap}>
              <View style={styles.shareSheetHandle} />
            </View>

            <Text style={styles.shareSheetSectionTitle}>分享至</Text>

            {/* 两个分享选项：小红书 + 复制链接 */}
            <View style={styles.shareOptionsRow}>
              {/* 小红书 */}
              <Pressable style={styles.shareOption} onPress={shareToXiaohongshu}>
                <View style={[styles.shareOptionIcon, { backgroundColor: "#FF2442" }]}>
                  <Text style={styles.shareOptionIconText}>书</Text>
                </View>
                <Text style={styles.shareOptionLabel}>小红书</Text>
              </Pressable>

              {/* 复制链接 */}
              <Pressable style={styles.shareOption} onPress={copyShareLink}>
                <View style={[styles.shareOptionIcon, { backgroundColor: "#4B5563" }]}>
                  <IconSymbol name="link" size={24} color="#ffffff" />
                </View>
                <Text style={styles.shareOptionLabel}>复制链接</Text>
              </Pressable>
            </View>

          </Pressable>
        </Pressable>
      </Modal>

      {/* 复制链接 Toast 提示 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.toastContainer, { bottom: insets.bottom + 48 }, toastAnimatedStyle]}
      >
        <View style={styles.toastInner}>
          <View style={styles.toastIconWrap}>
            <IconSymbol name="checkmark.circle.fill" size={18} color="#22C55E" />
          </View>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      </Animated.View>

      {/* 新手引导 1：上滑翻页（首屏 0.5~1s 后显示，完成一次上滑后关闭） */}
      {showSwipeGuide && (
        <SwipeGuideModal
          hintText="上滑查看下一张投票卡"
          onDismiss={handleSwipeGuideDismiss}
        />
      )}

    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
    gap: 12,
  },
  shareBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  shareBtnIcon: {
    width: 18,
    height: 18,
    tintColor: "rgba(255,255,255,0.85)",
  },
  content: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 24,
    paddingTop: 110,
    paddingBottom: 100,
  },
  voteTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginTop: -SCREEN_HEIGHT * 0.05,
    marginBottom: 20,
  },
  voteDateSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: -20,
    marginBottom: 0,
  },
  voteTitleSmall: {
    fontSize: 22,
  },
  voteSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: -12,
    marginBottom: 12,
  },
  resultsList: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 12,
    gap: 16,
  },
  resultItemSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  resultPhoto: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  resultStats: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultPercentage: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
  },
  uploadOrderText: {
    fontSize: 12,
    color: "#64748B",
  },
  yourChoiceBadge: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  yourChoiceText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  resultVotes: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 8,
  },
  resultBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  resultBarFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 3,
  },
  resultBarFillSelected: {
    backgroundColor: "#6366F1",
  },
  totalVotes: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginTop: 16,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  actionButtonActive: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderColor: "#6366F1",
  },
  actionButtonText: {
    color: "#6366F1",
    fontSize: 15,
    fontWeight: "600",
  },
  actionButtonTextActive: {
    color: "#EF4444",
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  commentsDrawer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: SCREEN_HEIGHT * 0.65,
    minHeight: SCREEN_HEIGHT * 0.65,
    maxHeight: SCREEN_HEIGHT * 0.65,
  },
  drawerHandleWrap: {
    alignItems: "center",
    paddingVertical: 12,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#11181C",
  },
  drawerCloseBtn: {
    padding: 4,
  },
  drawerBody: {
    flex: 1,
    paddingHorizontal: 16,
    minHeight: 200,
  },
  drawerImagePreviewRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  drawerImagePreviewWrap: {
    position: "relative",
    width: 72,
    height: 72,
  },
  drawerImagePreview: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  drawerImageRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  drawerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
  },
  drawerInputAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginBottom: 2,
  },
  drawerInputAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E0E7FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  drawerInputAvatarText: {
    fontSize: 12,
    color: "#6366F1",
    fontWeight: "600",
  },
  drawerInputActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  drawerImageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerImageBtnDisabled: {
    opacity: 0.4,
  },
  drawerInput: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#11181C",
    fontSize: 14,
    maxHeight: 80,
  },
  drawerSendBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerSendBtnDisabled: {
    backgroundColor: "#E5E7EB",
  },
  drawerSendBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  drawerSendBtnTextDisabled: {
    color: "#9CA3AF",
  },
  drawerCommentsList: {
    flex: 1,
    maxHeight: 320,
  },
  drawerCommentsContent: {
    paddingBottom: 24,
  },
  drawerNoComments: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
  drawerCommentItem: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  drawerCommentAvatarWrap: {
    position: "relative",
    width: 40,
    height: 40,
  },
  drawerCommentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerCommentAvatarPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  drawerCommentAvatarText: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "600",
  },
  drawerPhotoNumBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerPhotoNumText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
  },
  drawerCommentBody: {
    flex: 1,
  },
  drawerCommentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  drawerCommentUser: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  drawerVoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  drawerVoteBadgeText: {
    color: "#6366F1",
    fontSize: 11,
    fontWeight: "600",
  },
  drawerCommentContent: {
    color: "#11181C",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  drawerCommentTime: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  drawerCommentImagesRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  drawerCommentImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  stateBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: "#64748B",
  },
  backToPrevBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0F172A",
  },
  backToPrevText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  photosGrid: {
    paddingBottom: 24,
    gap: 12,
  },
  photosGridSingleColumn: {
    flexDirection: "column",
    alignItems: "center",
  },
  photoBlockOffset: {
    marginTop: SCREEN_HEIGHT * 0.05,
  },
  photoBlockOffsetTwo: {
    marginTop: SCREEN_HEIGHT * 0.02,
  },
  photosGridTwoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
    width: "100%",
  },
  photoRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  photoRowCenter: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
  },
  photoCard: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 0,
    borderWidth: 0,
    borderColor: "transparent",
    aspectRatio: 1,
    overflow: "hidden",
  },
  photoCardPressable: {
    flex: 1,
  },
  photoCardGrid: {
    width: "49%",
    aspectRatio: 1,
    flexBasis: "49%",
  },
  photoCardLarge: {
    width: "80%",
    aspectRatio: 1,
    alignSelf: "center",
  },
  photoCardFull: {
    width: "100%",
    aspectRatio: 1,
  },
  photoImageWrap: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "#000000",
  },
  imageViewerScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  imageViewerScrollContent: {
    flexDirection: "row",
  },
  imageViewerPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  imageViewerImage: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
  // ── 分享底部弹窗 ──
  shareSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  shareSheetContainer: {
    backgroundColor: "#16213e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
  },
  shareSheetHandleWrap: {
    alignItems: "center",
    paddingVertical: 12,
  },
  shareSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  shareSheetSectionTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  shareOptionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 48,
    marginBottom: 28,
  },
  shareOption: {
    alignItems: "center",
    gap: 8,
    width: 68,
  },
  shareOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  shareOptionIconText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  shareOptionIconTextSm: {
    fontSize: 16,
  },
  shareOptionLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    textAlign: "center",
  },
  toastContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  toastInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(15, 15, 25, 0.88)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  toastIconWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  toastText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
