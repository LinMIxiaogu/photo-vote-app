import { memo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";

type Props = {
  visible: boolean;
  insetsBottom: number;
  onClose: () => void;
  onShareToXiaohongshu: () => void;
  onCopyLink: () => void;
};

export const ShareSheet = memo(function ShareSheet({
  visible,
  insetsBottom,
  onClose,
  onShareToXiaohongshu,
  onCopyLink,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.shareSheetOverlay} onPress={onClose}>
        <Pressable
          style={[styles.shareSheetContainer, { paddingBottom: insetsBottom + 20 }]}
          onPress={() => {}}
        >
          <View style={styles.shareSheetHandleWrap}>
            <View style={styles.shareSheetHandle} />
          </View>

          <Text style={styles.shareSheetSectionTitle}>分享到</Text>

          <View style={styles.shareOptionsRow}>
            <Pressable style={styles.shareOption} onPress={onShareToXiaohongshu}>
              <View style={[styles.shareOptionIcon, { backgroundColor: "#FF2442" }]}>
                <Text style={styles.shareOptionIconText}>书</Text>
              </View>
              <Text style={styles.shareOptionLabel}>小红书</Text>
            </Pressable>

            <Pressable style={styles.shareOption} onPress={onCopyLink}>
              <View style={[styles.shareOptionIcon, { backgroundColor: "#4B5563" }]}>
                <IconSymbol name="link" size={24} color="#ffffff" />
              </View>
              <Text style={styles.shareOptionLabel}>复制链接</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
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
  shareOptionLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    textAlign: "center",
  },
});
