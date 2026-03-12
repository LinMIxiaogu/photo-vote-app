import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, type SharedValue, withTiming } from "react-native-reanimated";

import { SCREEN_HEIGHT, SWIPE_THRESHOLD } from "@/features/vote-flow/constants";

type Params = {
  canSwipePrev: boolean;
  canSwipeNext: boolean;
  swipeDirection: SharedValue<-1 | 0 | 1>;
  translateY: SharedValue<number>;
  onSwipeNext: () => void;
  onSwipePrev: () => void;
};

export function useVoteFlowGesture({
  canSwipePrev,
  canSwipeNext,
  swipeDirection,
  translateY,
  onSwipeNext,
  onSwipePrev,
}: Params) {
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(true)
        .onUpdate((event) => {
          const dragY = event.translationY;
          const isNextDirection = dragY < 0;
          const isPrevDirection = dragY > 0;
          const allowMove = (isPrevDirection && canSwipePrev) || (isNextDirection && canSwipeNext);

          if (!allowMove) {
            swipeDirection.value = 0;
            translateY.value = 0;
            return;
          }

          swipeDirection.value = isNextDirection ? -1 : 1;
          translateY.value = dragY;
        })
        .onEnd((event) => {
          const toNext = event.translationY <= -SWIPE_THRESHOLD && canSwipeNext;
          const toPrev = event.translationY >= SWIPE_THRESHOLD && canSwipePrev;

          if (toPrev) {
            swipeDirection.value = 1;
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, () => {
              runOnJS(onSwipePrev)();
            });
          } else if (toNext) {
            swipeDirection.value = -1;
            translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200 }, () => {
              runOnJS(onSwipeNext)();
            });
          } else {
            translateY.value = withTiming(0, { duration: 220 }, () => {
              swipeDirection.value = 0;
            });
          }
        })
        .runOnJS(true),
    [canSwipeNext, canSwipePrev, onSwipeNext, onSwipePrev, swipeDirection, translateY],
  );
}
