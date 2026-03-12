import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";

type Props = {
  message: string;
  bottom: number;
  animatedStyle: AnimatedStyle<any>;
};

export const VoteFlowToast = memo(function VoteFlowToast({
  message,
  bottom,
  animatedStyle,
}: Props) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toastContainer, { bottom }, animatedStyle]}
    >
      <View style={styles.toastInner}>
        <View style={styles.toastIconWrap}>
          <IconSymbol name="checkmark.circle.fill" size={18} color="#22C55E" />
        </View>
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
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
