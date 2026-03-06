import { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const AUTO_DISMISS_MS = 3200;
const GESTURE_DISTANCE = 92;

export interface SwipeGuideModalProps {
  onDismiss?: () => void;
  hintText?: string;
}

export function SwipeGuideModal({
  onDismiss,
  hintText = "上滑查看下一张投票卡",
}: SwipeGuideModalProps) {
  const backdropOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.94);
  const handTranslateY = useSharedValue(28);
  const handOpacity = useSharedValue(0);
  const trailOpacity = useSharedValue(0);
  const trailScale = useSharedValue(0.8);
  const arrowOffset = useSharedValue(10);
  const arrowOpacity = useSharedValue(0);

  useEffect(() => {
    backdropOpacity.value = withTiming(1, { duration: 220 });
    cardOpacity.value = withTiming(1, { duration: 260 });
    cardScale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    handOpacity.value = withTiming(1, { duration: 260 });
  }, [backdropOpacity, cardOpacity, cardScale, handOpacity]);

  useEffect(() => {
    handTranslateY.value = withRepeat(
      withSequence(
        withTiming(28, { duration: 0 }),
        withTiming(-GESTURE_DISTANCE, { duration: 1100, easing: Easing.out(Easing.cubic) }),
        withTiming(-GESTURE_DISTANCE, { duration: 120 }),
        withTiming(28, { duration: 0 }),
        withTiming(28, { duration: 520 })
      ),
      -1,
      false
    );

    trailOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 80 }),
        withTiming(0.85, { duration: 220 }),
        withTiming(0.15, { duration: 760 }),
        withTiming(0, { duration: 680 })
      ),
      -1,
      false
    );

    trailScale.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 0 }),
        withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 740 })
      ),
      -1,
      false
    );

    arrowOffset.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 0 }),
        withTiming(-8, { duration: 600, easing: Easing.out(Easing.quad) }),
        withTiming(-16, { duration: 320 }),
        withTiming(10, { duration: 0 }),
        withTiming(10, { duration: 820 })
      ),
      -1,
      false
    );

    arrowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 100 }),
        withTiming(1, { duration: 280 }),
        withTiming(0.25, { duration: 760 }),
        withTiming(0.2, { duration: 600 })
      ),
      -1,
      false
    );
  }, [arrowOffset, arrowOpacity, handTranslateY, trailOpacity, trailScale]);

  useEffect(() => {
    if (!onDismiss) return;
    const timer = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const handStyle = useAnimatedStyle(() => ({
    opacity: handOpacity.value,
    transform: [{ translateY: handTranslateY.value }],
  }));

  const trailStyle = useAnimatedStyle(() => ({
    opacity: trailOpacity.value,
    transform: [{ translateY: handTranslateY.value / 1.35 }, { scaleY: trailScale.value }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateY: arrowOffset.value }],
  }));

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />

      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>新手指引</Text>
          <Text style={styles.title}>{hintText}</Text>
          <Text style={styles.subtitle}>向上滑动即可切换到下一张投票卡</Text>
        </View>

        <View style={styles.demoSection}>
          <View style={styles.demoFrame}>
            <View style={styles.demoGlow} />
            <Animated.View style={[styles.arrowGroup, arrowStyle]}>
              <View style={styles.chevron} />
              <View style={[styles.chevron, styles.chevronMiddle]} />
              <View style={[styles.chevron, styles.chevronTop]} />
            </Animated.View>

            <Animated.View style={[styles.trail, trailStyle]} />

            <Animated.View style={[styles.handWrap, handStyle]}>
              <View style={styles.handShadow} />
              <View style={styles.hand}>
                <View style={styles.handThumb} />
              </View>
            </Animated.View>

            <View style={styles.captionBubble}>
              <Text style={styles.captionText}>上滑翻页</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 11, 18, 0.42)",
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 32, 360),
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 26,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B35",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: "#16181D",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#6B7280",
    textAlign: "center",
  },
  demoSection: {
    marginTop: 22,
    alignItems: "center",
  },
  demoFrame: {
    width: "100%",
    height: 270,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#F6F8FC",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    alignItems: "center",
    justifyContent: "center",
  },
  demoGlow: {
    position: "absolute",
    top: 28,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(255, 107, 53, 0.08)",
  },
  arrowGroup: {
    position: "absolute",
    top: 50,
    alignItems: "center",
  },
  chevron: {
    width: 18,
    height: 18,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#FF6B35",
    transform: [{ rotate: "45deg" }],
  },
  chevronMiddle: {
    marginTop: -8,
    opacity: 0.7,
  },
  chevronTop: {
    marginTop: -8,
    opacity: 0.4,
  },
  trail: {
    position: "absolute",
    width: 14,
    height: 116,
    borderRadius: 999,
    backgroundColor: "rgba(255, 107, 53, 0.18)",
  },
  handWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  handShadow: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 107, 53, 0.12)",
    transform: [{ scale: 1.45 }],
  },
  hand: {
    width: 38,
    height: 56,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D5DCE6",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 7,
    shadowColor: "#D1D5DB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  handThumb: {
    width: 8,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#FF6B35",
  },
  captionBubble: {
    position: "absolute",
    bottom: 28,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#16181D",
  },
  captionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
