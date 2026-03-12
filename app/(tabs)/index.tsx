import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { SwipeGuideModal } from "@/components/SwipeGuideModal";
import { VoteCardStack } from "@/components/vote-card-stack";
import {
  ImageViewerModal,
} from "@/features/vote-flow/components/image-viewer-modal";
import { ShareSheet } from "@/features/vote-flow/components/share-sheet";
import { VoteFlowToast } from "@/features/vote-flow/components/vote-flow-toast";
import {
  BATCH_SIZE,
  SCREEN_WIDTH,
} from "@/features/vote-flow/constants";
import type { VoteCardData, VotePhotoStat } from "@/features/vote-flow/types";
import { useVoteCardQueue } from "@/features/vote-flow/hooks/use-vote-card-queue";
import { useVoteFlowGesture } from "@/features/vote-flow/hooks/use-vote-flow-gesture";
import { useAuth } from "@/hooks/use-auth";
import { getApiBaseUrl } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";

const shareIcon = require("@/assets/images/share-icon-card.png");
const SWIPE_GUIDE_SHOWN_KEY = "@swipe_guide_shown_v1";
const IMAGE_VIEWER_TOUCH_BLOCK_MS = Platform.OS === "ios" ? 800 : 500;

export default function VoteFlowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId?: string }>();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const requestedCardId = params.cardId ? Number.parseInt(params.cardId, 10) : 0;

  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [expandedPhotoIndex, setExpandedPhotoIndex] = useState<number | null>(null);
  const [isPhotoInteractionLocked, setIsPhotoInteractionLocked] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareThumbnail, setShareThumbnail] = useState<string | null>(null);
  const [hideShareBtn, setHideShareBtn] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const [showSwipeGuide, setShowSwipeGuide] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const swipeGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageViewerScrollRef = useRef<ScrollView>(null);
  const cardCaptureRef = useRef<View>(null);
  const lastTapRef = useRef(0);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageViewerDismissedAtRef = useRef(0);
  const imageViewerUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(0);
  const swipeDirection = useSharedValue<-1 | 0 | 1>(0);
  const toastOpacity = useSharedValue(0);
  const toastTranslateY = useSharedValue(30);
  const toastAnimatedStyle = useAnimatedStyle(() => ({
    opacity: toastOpacity.value,
    transform: [{ translateY: toastTranslateY.value }],
  }));

  const { data: requestedCardData, isLoading: isRequestedCardLoading } =
    trpc.cards.getById.useQuery({ cardId: requestedCardId }, { enabled: requestedCardId > 0 });

  const resetCardViewState = useCallback(() => {
    setSelectedPhotoId(null);
    setExpandedPhotoIndex(null);
    translateY.value = 0;
    swipeDirection.value = 0;
  }, [swipeDirection, translateY]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastOpacity.value = withTiming(1, { duration: 220 });
    toastTranslateY.value = withSpring(0, { damping: 14, stiffness: 160 });
    toastTimeoutRef.current = setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 300 });
      toastTranslateY.value = withTiming(16, { duration: 300 });
    }, 2000);
  }, [toastOpacity, toastTranslateY]);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      if (swipeGuideTimerRef.current) clearTimeout(swipeGuideTimerRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (imageViewerUnlockTimerRef.current) clearTimeout(imageViewerUnlockTimerRef.current);
    };
  }, []);

  const clearPhotoTapState = useCallback(() => {
    lastTapRef.current = 0;
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
  }, []);

  const lockPhotoInteractions = useCallback(() => {
    setIsPhotoInteractionLocked(true);
    if (imageViewerUnlockTimerRef.current) {
      clearTimeout(imageViewerUnlockTimerRef.current);
      imageViewerUnlockTimerRef.current = null;
    }
  }, []);

  const unlockPhotoInteractionsWithDelay = useCallback((delay = IMAGE_VIEWER_TOUCH_BLOCK_MS) => {
    if (imageViewerUnlockTimerRef.current) {
      clearTimeout(imageViewerUnlockTimerRef.current);
    }
    imageViewerUnlockTimerRef.current = setTimeout(() => {
      setIsPhotoInteractionLocked(false);
      imageViewerUnlockTimerRef.current = null;
    }, delay);
  }, []);

  const {
    currentCard,
    previousCards,
    queueLoading,
    queueError,
    isTransitioning,
    nextCard,
    previousCard,
    showQueueError,
    showEmpty,
    showLoading: queueStateLoading,
    canSwipePrev,
    canSwipeNext,
    performRefill,
    goToNextCard,
    goToPreviousCard,
  } = useVoteCardQueue({
    userId: user ? String(user.id) : undefined,
    requestedCardId,
    requestedCardData: (requestedCardData as VoteCardData | undefined),
    isRequestedCardLoading,
    resetViewState: resetCardViewState,
    onBeforeNextCardChange: () => {
      setSelectedPhotoId(null);
      setExpandedPhotoIndex(null);
    },
    onAfterCardChange: () => {
      translateY.value = 0;
      swipeDirection.value = 0;
    },
    fetchRandomCards: async (excludeCardIds) =>
      (await utils.cards.getRandomForVotingBatch.fetch({
        count: BATCH_SIZE,
        excludeCardIds: excludeCardIds.length > 0 ? excludeCardIds : undefined,
      })) as VoteCardData[],
    prefetchVoteResult: (cardId) => utils.votes.myVoteResult.prefetch({ cardId }),
  });

  const { data: myVoteResultData, isLoading: isCheckingVote } =
    trpc.votes.myVoteResult.useQuery(
      { cardId: currentCard?.id ?? 0 },
      { enabled: !!currentCard && !!user },
    );

  useEffect(() => {
    if (!currentCard) return;
    if (swipeGuideTimerRef.current) clearTimeout(swipeGuideTimerRef.current);

    const delay = 500 + Math.random() * 500;
    swipeGuideTimerRef.current = setTimeout(() => {
      swipeGuideTimerRef.current = null;
      AsyncStorage.getItem(SWIPE_GUIDE_SHOWN_KEY)
        .then((value) => {
          if (!value) setShowSwipeGuide(true);
        })
        .catch(() => {});
    }, delay);

    return () => {
      if (swipeGuideTimerRef.current) clearTimeout(swipeGuideTimerRef.current);
    };
  }, [currentCard?.id]);

  useEffect(() => {
    if (expandedPhotoIndex === null || !currentCard?.photos.length) return;
    const timer = setTimeout(() => {
      imageViewerScrollRef.current?.scrollTo({
        x: expandedPhotoIndex * SCREEN_WIDTH,
        animated: false,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [currentCard?.photos.length, expandedPhotoIndex]);

  const handleSwipeGuideDismiss = useCallback(() => {
    setShowSwipeGuide(false);
    AsyncStorage.setItem(SWIPE_GUIDE_SHOWN_KEY, "1").catch(() => {});
  }, []);

  const submitVoteMutation = trpc.votes.submit.useMutation({
    onSuccess: (data, variables) => {
      const votedPhotoId = data.photoId;
      setSelectedPhotoId(votedPhotoId);

      if (currentCard) {
        const stats: VotePhotoStat[] = data.photoStats ?? currentCard.photos.map((photo) => {
          const isSelected = photo.id === votedPhotoId;
          const voteCount = isSelected ? data.voteCount : photo.voteCount;
          const percentage = data.totalVotes > 0 ? Math.round((voteCount / data.totalVotes) * 100) : 0;
          return { id: photo.id, percentage, voteCount };
        });

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
          },
        );
      }

      router.push({ pathname: "/result", params: { cardId: String(variables.cardId), from: "vote-flow" } });
    },
    onError: (error) => {
      console.error("Vote error:", error);
      goToNextCard();
    },
  });

  const handleSelectPhoto = useCallback(
    (photoId: number) => {
      if (!currentCard || isCheckingVote || submitVoteMutation.isPending) return;

      if (!user) {
        if (Platform.OS === "web") {
          window.alert("请先登录后再投票");
        } else {
          Alert.alert("提示", "请先登录后再投票", [
            { text: "去登录", onPress: () => router.push("/login") },
            { text: "取消" },
          ]);
        }
        return;
      }

      if (myVoteResultData) {
        router.push({ pathname: "/result", params: { cardId: String(currentCard.id), from: "vote-flow" } });
        return;
      }

      setSelectedPhotoId(photoId);
      submitVoteMutation.mutate({ cardId: currentCard.id, photoId });
    },
    [currentCard, isCheckingVote, myVoteResultData, router, submitVoteMutation, user],
  );

  const handlePhotoPress = useCallback((photoId: number, photoIndex: number) => {
    const now = Date.now();
    const dismissedAgo = now - imageViewerDismissedAtRef.current;

    if (
      isPhotoInteractionLocked ||
      dismissedAgo < IMAGE_VIEWER_TOUCH_BLOCK_MS
    ) {
      clearPhotoTapState();
      return;
    }

    if (now - lastTapRef.current < 400 && singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
      lastTapRef.current = 0;
      lockPhotoInteractions();
      setExpandedPhotoIndex(photoIndex);
      return;
    }

    lastTapRef.current = now;
    singleTapTimeoutRef.current = setTimeout(() => {
      handleSelectPhoto(photoId);
      singleTapTimeoutRef.current = null;
    }, 300);
  }, [clearPhotoTapState, handleSelectPhoto, isPhotoInteractionLocked, lockPhotoInteractions]);

  const handleCloseImageViewer = useCallback(() => {
    imageViewerDismissedAtRef.current = Date.now();
    clearPhotoTapState();
    setExpandedPhotoIndex(null);
    unlockPhotoInteractionsWithDelay();
  }, [clearPhotoTapState, unlockPhotoInteractionsWithDelay]);

  const handleQueueNext = useCallback(() => {
    if (showSwipeGuide) {
      handleSwipeGuideDismiss();
    }
    goToNextCard();
  }, [goToNextCard, handleSwipeGuideDismiss, showSwipeGuide]);

  const handleOpenShareSheet = useCallback(async () => {
    if (!currentCard || isSharing) return;

    setIsSharing(true);
    try {
      setHideShareBtn(true);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const uri = await captureRef(cardCaptureRef, { format: "jpg", quality: 0.85, result: "tmpfile" });
      setHideShareBtn(false);
      setShareThumbnail(uri);
      setShowShareSheet(true);
    } catch (error) {
      setHideShareBtn(false);
      console.error("[share] capture failed:", error);
      Alert.alert("截图失败", "截图时出现错误，请稍后重试。");
    } finally {
      setIsSharing(false);
    }
  }, [currentCard, isSharing]);

  const closeShareSheet = useCallback(() => setShowShareSheet(false), []);

  const shareToXiaohongshu = useCallback(async () => {
    closeShareSheet();
    if (!shareThumbnail) return;

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("需要相册权限", "请在设置中允许访问相册。");
        return;
      }

      await MediaLibrary.saveToLibraryAsync(shareThumbnail);
      const xhsScheme = "xhsdiscover://post";
      const canOpen = Platform.OS === "android" ? true : await Linking.canOpenURL(xhsScheme);

      if (!canOpen) {
        Alert.alert("截图已保存", "请打开小红书 App，从相册选择刚保存的图片发布。");
        return;
      }

      try {
        await Linking.openURL(xhsScheme);
      } catch {
        Alert.alert("截图已保存", "未能自动打开小红书，请从相册选择刚保存的图片发布。");
      }
    } catch {
      Alert.alert("分享失败", "请稍后重试。");
    }
  }, [closeShareSheet, shareThumbnail]);

  const copyShareLink = useCallback(async () => {
    closeShareSheet();
    if (!currentCard) return;

    const base = getApiBaseUrl();
    const url = `${base}/share/card/${currentCard.id}`;
    const title = currentCard.title || "有趣的投票";
    await Clipboard.setStringAsync(`${title} ${url}\n复制后打开【一选】参与投票！`);
    showToast("链接已复制到剪贴板");
  }, [closeShareSheet, currentCard, showToast]);

  const showLoading = authLoading || queueStateLoading;
  const swipeGesture = useVoteFlowGesture({
    canSwipePrev,
    canSwipeNext,
    swipeDirection,
    translateY,
    onSwipeNext: handleQueueNext,
    onSwipePrev: goToPreviousCard,
  });

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View ref={cardCaptureRef} collapsable={false} style={styles.fullScreen}>
          <View style={styles.background} />

          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerSpacer} />
            {!!currentCard && !hideShareBtn && Platform.OS !== "web" ? (
              <Pressable
                onPress={handleOpenShareSheet}
                disabled={isSharing}
                style={styles.shareBtn}
                hitSlop={8}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
                ) : (
                  <View style={styles.shareBtnIconWrap}>
                    <Image source={shareIcon} style={styles.shareBtnIcon} contentFit="contain" />
                  </View>
                )}
              </Pressable>
            ) : null}
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
              <Text style={styles.stateText}>当前没有新卡片</Text>
              <Pressable onPress={goToPreviousCard} style={styles.backToPrevBtn}>
                <Text style={styles.backToPrevText}>返回上一张</Text>
              </Pressable>
            </View>
          ) : showEmpty ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>暂无可展示图片</Text>
            </View>
          ) : currentCard ? (
            <View style={[styles.content, { paddingTop: insets.top + 84 }]}>
              <VoteCardStack
                activeCard={currentCard}
                nextCard={nextCard}
                previousCard={previousCard}
                selectedPhotoId={selectedPhotoId}
                interactionsDisabled={isPhotoInteractionLocked || expandedPhotoIndex !== null}
                onPhotoPress={handlePhotoPress}
                translateY={translateY}
                swipeDirection={swipeDirection}
              />
            </View>
          ) : null}

          <ImageViewerModal
            visible={expandedPhotoIndex !== null && !!currentCard}
            photos={currentCard?.photos ?? []}
            scrollRef={imageViewerScrollRef}
            onClose={handleCloseImageViewer}
            onMomentumScrollEnd={(index) => {
              if (!currentCard) return;
              const nextIndex = Math.min(Math.max(0, index), currentCard.photos.length - 1);
              setExpandedPhotoIndex(nextIndex);
            }}
          />
        </Animated.View>
      </GestureDetector>

      <ShareSheet
        visible={showShareSheet}
        insetsBottom={insets.bottom}
        onClose={closeShareSheet}
        onShareToXiaohongshu={shareToXiaohongshu}
        onCopyLink={copyShareLink}
      />

      <VoteFlowToast
        message={toastMessage}
        bottom={insets.bottom + 48}
        animatedStyle={toastAnimatedStyle}
      />

      {showSwipeGuide ? (
        <SwipeGuideModal
          hintText="上滑查看下一张投票卡"
          onDismiss={handleSwipeGuideDismiss}
        />
      ) : null}
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
  headerSpacer: {
    flex: 1,
  },
  shareBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  shareBtnIconWrap: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  shareBtnIcon: {
    width: 18,
    height: 18,
  },
  content: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 24,
    paddingBottom: 100,
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
});
