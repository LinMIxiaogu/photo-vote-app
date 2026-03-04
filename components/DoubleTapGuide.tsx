import { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
} from "react-native-reanimated";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/** 圆圈起始直径（px）。通过 scale 动画从 0.1 放大到 1.6 */
const RIPPLE_SIZE = 96;

// 双击指引配色：鲜明、易识别
const RIPPLE_RING_COLOR = "#A78BFA";       // 紫罗兰，与底部导航紫呼应
const RIPPLE_FILL_COLOR = "rgba(167, 139, 250, 0.45)";
const RIPPLE_GLOW_COLOR = "#C4B5FD";        // 浅紫光晕
const CENTER_DOT_COLOR = "#FFFFFF";
const CENTER_DOT_GLOW = "rgba(196, 181, 253, 0.9)";

export type PhotoLayout = { x: number; y: number; width: number; height: number };

export interface DoubleTapGuideProps {
  onDismiss: () => void;
  /** 图片区域在屏幕上的位置（2/3/4 图布局不同，由父组件 measureInWindow 得到）。为 null 时圆环落在屏幕中部作为兜底。 */
  photoLayout?: PhotoLayout | null;
}

/**
 * 新手操作引导，分两阶段：
 *   文本提示与圆圈动效同时展示，约 3.2 秒后关闭
 */
export function DoubleTapGuide({ onDismiss, photoLayout = null }: DoubleTapGuideProps) {
  // 文本提示
  const pillOpacity = useSharedValue(0);

  useEffect(() => {
    pillOpacity.value = withTiming(1, { duration: 300 });
    const fadeOutTimer = setTimeout(() => {
      pillOpacity.value = withTiming(0, { duration: 350 });
    }, 2600);
    return () => clearTimeout(fadeOutTimer);
  }, []);

  // 双击圆圈动效（外圈环 + 内填充“水花”）
  // 两个 tap 共享同一圆心，r2 在 r1 之后 380ms 出现
  const r1Scale = useSharedValue(0.1);
  const r1Opacity = useSharedValue(0);
  const r1FillScale = useSharedValue(0.2);
  const r1FillOpacity = useSharedValue(0);
  const r2Scale = useSharedValue(0.1);
  const r2Opacity = useSharedValue(0);
  const r2FillScale = useSharedValue(0.2);
  const r2FillOpacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.out(Easing.quad);

    // ── 第 1 次 tap：外环 + 内填充 ─────────────────────────────────────
    r1Scale.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 0 }),
        withTiming(1.6, { duration: 600, easing: ease }),
        withTiming(0.1, { duration: 0 }),
        withTiming(0.1, { duration: 900 }),
      ),
      2,
      false,
    );
    r1Opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0, { duration: 600, easing: ease }),
        withTiming(0, { duration: 900 }),
      ),
      2,
      false,
    );
    r1FillScale.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 0 }),
        withTiming(1.25, { duration: 600, easing: ease }),
        withTiming(0.2, { duration: 0 }),
        withTiming(0.2, { duration: 900 }),
      ),
      2,
      false,
    );
    r1FillOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 0 }),
        withTiming(0, { duration: 600, easing: ease }),
        withTiming(0, { duration: 900 }),
      ),
      2,
      false,
    );

    // ── 第 2 次 tap：延迟 380ms ────────────────────────────────────────
    r2Scale.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 380 }),
        withTiming(1.6, { duration: 600, easing: ease }),
        withTiming(0.1, { duration: 0 }),
        withTiming(0.1, { duration: 520 }),
      ),
      2,
      false,
    );
    r2Opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 380 }),
        withTiming(1, { duration: 0 }),
        withTiming(0, { duration: 600, easing: ease }),
        withTiming(0, { duration: 520 }),
      ),
      2,
      false,
    );
    r2FillScale.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 380 }),
        withTiming(1.25, { duration: 600, easing: ease }),
        withTiming(0.2, { duration: 0 }),
        withTiming(0.2, { duration: 520 }),
      ),
      2,
      false,
    );
    r2FillOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 380 }),
        withTiming(0.6, { duration: 0 }),
        withTiming(0, { duration: 600, easing: ease }),
        withTiming(0, { duration: 520 }),
      ),
      2,
      false,
    );

    const t = setTimeout(() => onDismiss(), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDismiss]);

  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOpacity.value }));
  const r1Style = useAnimatedStyle(() => ({
    transform: [{ scale: r1Scale.value }],
    opacity: r1Opacity.value,
  }));
  const r1FillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: r1FillScale.value }],
    opacity: r1FillOpacity.value,
  }));
  const r2Style = useAnimatedStyle(() => ({
    transform: [{ scale: r2Scale.value }],
    opacity: r2Opacity.value,
  }));
  const r2FillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: r2FillScale.value }],
    opacity: r2FillOpacity.value,
  }));

  return (
    <View pointerEvents="none" style={styles.overlay}>

      {/* 文本提示 */}
      <Animated.View style={[styles.pillWrap, pillStyle]}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>双击屏幕，立即投票</Text>
          </View>
      </Animated.View>

      {/* 双击圆圈（对准当前卡片图片区域中心） */}
      <View
          style={[
            styles.rippleAnchor,
            photoLayout
              ? {
                  left: photoLayout.x + photoLayout.width / 2 - RIPPLE_SIZE / 2,
                  top: photoLayout.y + photoLayout.height / 2 - RIPPLE_SIZE / 2,
                  width: RIPPLE_SIZE,
                  height: RIPPLE_SIZE,
                }
              : undefined,
          ]}
        >
          {/* 中心亮点：提示点击位置 */}
          <View style={styles.centerDot} />
          {/* 第 1 次 tap：内填充 + 外环 */}
          <Animated.View style={[styles.rippleFill, r1FillStyle]} />
          <Animated.View style={[styles.rippleRing, r1Style]} />
          {/* 第 2 次 tap：内填充 + 外环 */}
          <Animated.View style={[styles.rippleFill, r2FillStyle]} />
          <Animated.View style={[styles.rippleRing, r2Style]} />
      </View>

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
    zIndex: 200,
  },

  // ── Pill ────────────────────────────────────────────────────────────
  pillWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: SCREEN_HEIGHT * 0.44,
    alignItems: "center",
  },
  pill: {
    backgroundColor: "rgba(10, 10, 20, 0.80)",
    paddingHorizontal: 28,
    paddingVertical: 16,
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
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // ── Ripple ───────────────────────────────────────────────────────────
  rippleAnchor: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.40,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    height: RIPPLE_SIZE,
  },
  rippleRing: {
    position: "absolute",
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    borderWidth: 4,
    borderColor: RIPPLE_RING_COLOR,
    shadowColor: RIPPLE_GLOW_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    elevation: 8,
  },
  rippleFill: {
    position: "absolute",
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    backgroundColor: RIPPLE_FILL_COLOR,
  },
  centerDot: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CENTER_DOT_COLOR,
    shadowColor: CENTER_DOT_GLOW,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
});
