import { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/** 手指图标宽度 */
const FINGER_WIDTH = 52;
const FINGER_HEIGHT = 70;
const TRAIL_SIZE = 130;
/** 动画垂直移动距离（与交互方向一致：上滑 = 下一张） */
const SWIPE_DISTANCE = 120;
const AUTO_DISMISS_MS = 3200;

export interface SwipeGuideProps {
  onDismiss?: () => void;
  /** 是否为上滑（true=上滑下一张，false=下滑下一张）。动效方向与此一致。 */
  directionUp?: boolean;
  /** 提示文案 */
  hintText?: string;
}

/**
 * 首屏「翻页」指引：文字胶囊 + 手指从上往下/从下往上的滑动动效。
 * 与当前交互一致：上滑 = 查看下一张。
 */
export function SwipeGuide({
  onDismiss,
  directionUp = true,
  hintText = "上滑查看下一张投票卡",
}: SwipeGuideProps) {
  const pillOpacity = useSharedValue(0);
  const fingerTranslateY = useSharedValue(0);
  const fingerOpacity = useSharedValue(0);
  const fingerScale = useSharedValue(1);
  const trailOpacity = useSharedValue(0);
  const trailScale = useSharedValue(0.7);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.6);

  useEffect(() => {
    pillOpacity.value = withTiming(1, { duration: 320 });
    fingerOpacity.value = withTiming(1, { duration: 320 });
  }, [pillOpacity, fingerOpacity]);

  useEffect(() => {
    const sign = directionUp ? -1 : 1;
    fingerTranslateY.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(sign * SWIPE_DISTANCE, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(sign * SWIPE_DISTANCE, { duration: 160 }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 560 })
      ),
      -1,
      false,
    );
    fingerScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0.94, { duration: 480, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 560 }),
      ),
      -1,
      false,
    );
    trailOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(0.6, { duration: 180 }),
        withTiming(0, { duration: 640 }),
        withTiming(0, { duration: 540 }),
      ),
      -1,
      false,
    );
    trailScale.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 0 }),
        withTiming(1.05, { duration: 720, easing: Easing.out(Easing.cubic) }),
        withTiming(0.7, { duration: 0 }),
        withTiming(0.7, { duration: 560 }),
      ),
      -1,
      false,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(0.5, { duration: 220 }),
        withTiming(0, { duration: 680 }),
        withTiming(0, { duration: 540 }),
      ),
      -1,
      false,
    );
    glowScale.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 0 }),
        withTiming(1.25, { duration: 800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.6, { duration: 0 }),
        withTiming(0.6, { duration: 540 }),
      ),
      -1,
      false,
    );
  }, [directionUp, fingerTranslateY]);

  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOpacity.value }));
  const fingerStyle = useAnimatedStyle(() => ({
    opacity: fingerOpacity.value,
    transform: [{ translateY: fingerTranslateY.value }, { scale: fingerScale.value }],
  }));
  const trailStyle = useAnimatedStyle(() => ({
    opacity: trailOpacity.value,
    transform: [{ translateY: fingerTranslateY.value }, { scale: trailScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ translateY: fingerTranslateY.value }, { scale: glowScale.value }],
  }));

  useEffect(() => {
    if (!onDismiss) return;
    const t = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.pillWrap, pillStyle]}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{hintText}</Text>
        </View>
      </Animated.View>

      {/* 手指示意：居中偏下，沿 Y 轴滑动 */}
      <Animated.View style={[styles.fingerWrap, glowStyle]}>
        <View style={styles.swipeGlow} />
      </Animated.View>
      <Animated.View style={[styles.fingerWrap, trailStyle]}>
        <View style={styles.swipeTrail} />
      </Animated.View>
      <Animated.View style={[styles.fingerWrap, fingerStyle]}>
        <View style={styles.finger}>
          {/* 简化的手指形状：圆头 + 梯形体身 */}
          <View style={styles.fingerHead} />
          <View style={styles.fingerBody} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 199,
  },
  pillWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: SCREEN_HEIGHT * 0.28,
    alignItems: "center",
  },
  pill: {
    backgroundColor: "rgba(10, 10, 20, 0.80)",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 12,
  },
  pillText: {
    color: "rgba(255,255,255,0.93)",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  fingerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: SCREEN_HEIGHT * 0.54,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeTrail: {
    width: TRAIL_SIZE,
    height: TRAIL_SIZE,
    borderRadius: TRAIL_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#ffffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 6,
  },
  swipeGlow: {
    width: TRAIL_SIZE + 26,
    height: TRAIL_SIZE + 26,
    borderRadius: (TRAIL_SIZE + 26) / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowColor: "#ffffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  finger: {
    width: FINGER_WIDTH,
    height: FINGER_HEIGHT,
    alignItems: "center",
  },
  fingerHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  fingerBody: {
    position: "absolute",
    top: 22,
    left: 9,
    width: FINGER_WIDTH - 18,
    height: FINGER_HEIGHT - 22,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
});
