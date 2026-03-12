import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";

import {
  BATCH_SIZE,
  INITIAL_FETCH_TIMEOUT_MS,
  QUEUE_KEEP,
  QUEUE_MAX,
  REFILL_THRESHOLD,
} from "@/features/vote-flow/constants";
import type { VoteCardData } from "@/features/vote-flow/types";
import { getImageUrl } from "@/lib/utils";

type Params = {
  userId?: string | null;
  requestedCardId: number;
  requestedCardData: VoteCardData | undefined;
  isRequestedCardLoading: boolean;
  resetViewState: () => void;
  onBeforeNextCardChange: (nextPreviewCard: VoteCardData | null) => void;
  onAfterCardChange: () => void;
  fetchRandomCards: (excludeCardIds: number[]) => Promise<VoteCardData[]>;
  prefetchVoteResult: (cardId: number) => Promise<unknown>;
};

export function useVoteCardQueue({
  userId,
  requestedCardId,
  requestedCardData,
  isRequestedCardLoading,
  resetViewState,
  onBeforeNextCardChange,
  onAfterCardChange,
  fetchRandomCards,
  prefetchVoteResult,
}: Params) {
  const [currentCard, setCurrentCard] = useState<VoteCardData | null>(null);
  const [cardQueue, setCardQueue] = useState<VoteCardData[]>([]);
  const [previousCards, setPreviousCards] = useState<VoteCardData[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionPreviewCard, setTransitionPreviewCard] = useState<VoteCardData | null>(null);
  const [transitionPreviousCard, setTransitionPreviousCard] = useState<VoteCardData | null>(null);
  const [enableNextCardPreview, setEnableNextCardPreview] = useState(true);

  const sessionQueueIdsRef = useRef<number[]>([]);
  const prefetchedImageUrlsRef = useRef<Set<string>>(new Set());
  const isRefillInProgress = useRef(false);
  const appliedRequestedCardIdRef = useRef<number | null>(null);

  const finalizeTransition = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionPreviewCard(null);
        setTransitionPreviousCard(null);
        setEnableNextCardPreview(true);
        setIsTransitioning(false);
        onAfterCardChange();
      });
    });
  }, [onAfterCardChange]);

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

  const fetchBatch = useCallback(
    async (excludeCardIds: number[]) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("加载超时，请检查当前后端地址或网络连接")), INITIAL_FETCH_TIMEOUT_MS);
      });

      const batch = await Promise.race([
        fetchRandomCards(excludeCardIds.length > 0 ? excludeCardIds : []),
        timeoutPromise,
      ]);

      const fetched = (batch as VoteCardData[]).filter((card) => card.photos?.length > 0);
      if (userId) {
        fetched.forEach((card) => {
          prefetchVoteResult(card.id).catch(() => {});
        });
      }
      return fetched;
    },
    [fetchRandomCards, prefetchVoteResult, userId],
  );

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
          sessionQueueIdsRef.current = [];
          batch = await fetchBatch([]);
        }

        if (batch.length > 0) {
          sessionQueueIdsRef.current = [
            ...sessionQueueIdsRef.current,
            ...batch.map((card) => card.id),
          ];

          if (sessionQueueIdsRef.current.length >= QUEUE_MAX) {
            sessionQueueIdsRef.current = sessionQueueIdsRef.current.slice(-QUEUE_KEEP);
          }

          if (isInitial) {
            setCurrentCard((prev) => prev ?? batch[0] ?? null);
            setCardQueue((prev) => (prev.length > 0 ? prev : batch.slice(1)));
          } else {
            setCardQueue((prev) => [...prev, ...batch]);
          }
        }
      } catch (error) {
        console.error("Refill failed:", error);
        setQueueError(error instanceof Error ? error.message : "卡片加载失败，请稍后重试");
      } finally {
        isRefillInProgress.current = false;
        if (isInitial) setQueueLoading(false);
      }
    },
    [fetchBatch],
  );

  const resetPreview = useCallback(() => {
    setEnableNextCardPreview(false);
    setTransitionPreviewCard(null);
    setTransitionPreviousCard(null);
    requestAnimationFrame(() => setEnableNextCardPreview(true));
  }, []);

  const goToNextCard = useCallback(() => {
    setIsTransitioning(true);
    const promotedCard = cardQueue[0] ?? null;
    setEnableNextCardPreview(false);
    setTransitionPreviousCard(null);
    setTransitionPreviewCard(promotedCard);
    onBeforeNextCardChange(promotedCard);

    if (currentCard) {
      setPreviousCards((prev) => [...prev, currentCard]);
    }

    if (cardQueue.length > 0) {
      const [next, ...rest] = cardQueue;
      setCurrentCard(next);
      setCardQueue(rest);
      if (rest.length < REFILL_THRESHOLD) {
        performRefill(false);
      }
    } else {
      setCurrentCard(null);
    }

    setTimeout(() => {
      finalizeTransition();
    }, 80);
  }, [cardQueue, currentCard, finalizeTransition, onBeforeNextCardChange, performRefill]);

  const goToPreviousCard = useCallback(() => {
    if (previousCards.length === 0 || isTransitioning) return;

    setIsTransitioning(true);
    setEnableNextCardPreview(false);
    setTransitionPreviewCard(null);
    const previousCard = previousCards[previousCards.length - 1] ?? null;
    setTransitionPreviousCard(previousCard);
    onBeforeNextCardChange(previousCard);

    setTimeout(() => {
      setPreviousCards((prev) => {
        if (prev.length === 0) return prev;
        const newPrev = [...prev];
        const promotedPreviousCard = newPrev.pop()!;
        setCardQueue((queue) => (currentCard ? [currentCard, ...queue] : queue));
        setCurrentCard(promotedPreviousCard);
        return newPrev;
      });
      finalizeTransition();
    }, 80);
  }, [currentCard, finalizeTransition, isTransitioning, onBeforeNextCardChange, previousCards]);

  useEffect(() => {
    if (requestedCardId <= 0) {
      appliedRequestedCardIdRef.current = null;
      return;
    }
    if (!requestedCardData) return;
    if (appliedRequestedCardIdRef.current === requestedCardId) return;

    appliedRequestedCardIdRef.current = requestedCardId;
    resetViewState();
    setPreviousCards([]);
    setCurrentCard(requestedCardData);
    setCardQueue((prev) => prev.filter((card) => card.id !== requestedCardId));
    sessionQueueIdsRef.current = [
      requestedCardId,
      ...sessionQueueIdsRef.current.filter((id) => id !== requestedCardId),
    ];
  }, [requestedCardData, requestedCardId, resetViewState]);

  useEffect(() => {
    if (requestedCardId > 0 && appliedRequestedCardIdRef.current !== requestedCardId && isRequestedCardLoading) {
      return;
    }
    if (currentCard || cardQueue.length > 0 || isTransitioning) return;
    performRefill(true);
  }, [
    cardQueue.length,
    currentCard,
    isRequestedCardLoading,
    isTransitioning,
    performRefill,
    requestedCardId,
  ]);

  useEffect(() => {
    if (cardQueue.length === 0) return;
    prefetchUpcomingCardImages(cardQueue.slice(0, 3));
  }, [cardQueue, prefetchUpcomingCardImages]);

  return {
    currentCard,
    cardQueue,
    previousCards,
    queueLoading,
    queueError,
    isTransitioning,
    transitionPreviewCard,
    transitionPreviousCard,
    enableNextCardPreview,
    nextCard: enableNextCardPreview ? (transitionPreviewCard ?? cardQueue[0] ?? null) : transitionPreviewCard,
    previousCard: transitionPreviousCard ?? previousCards[previousCards.length - 1] ?? null,
    showQueueError: !currentCard && !queueLoading && !isTransitioning && !!queueError,
    showEmpty: !currentCard && !queueLoading && !isTransitioning && !queueError && previousCards.length === 0,
    showLoading: !currentCard && (queueLoading || isTransitioning),
    canSwipePrev: previousCards.length > 0,
    canSwipeNext: !!currentCard,
    performRefill,
    goToNextCard,
    goToPreviousCard,
    resetPreview,
  };
}
