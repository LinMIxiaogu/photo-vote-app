import { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";

const TITLE_MAX = 14;
const DESC_MAX = 2000;

type CardInfo = {
  id: number;
  title?: string | null;
  description?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  card: CardInfo | null;
  onSuccess?: () => void;
};

export function EditCardModal({ visible, onClose, card, onSuccess }: Props) {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const utils = trpc.useUtils();

  const updateMutation = trpc.cards.update.useMutation({
    onSuccess: () => {
      utils.cards.getMyCards.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      Alert.alert("保存失败", err.message ?? "请稍后重试");
    },
  });

  useEffect(() => {
    if (visible && card) {
      setTitle(card.title ?? "");
      setDescription(card.description ?? "");
    }
  }, [visible, card]);

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleClose = () => {
    if (updateMutation.isPending) return;
    onClose();
  };

  const handleSave = () => {
    if (!card) return;
    haptic();
    updateMutation.mutate({
      cardId: card.id,
      title: title.trim() || null,
      description: description.trim() || null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheetInner, { backgroundColor: colors.background }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>编辑卡片</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {/* Title field */}
            <Text style={[styles.label, { color: colors.muted }]}>主题</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="给投票卡片起个主题（最多 14 字）"
                placeholderTextColor={colors.muted}
                value={title}
                onChangeText={(v) => setTitle(v.slice(0, TITLE_MAX))}
                maxLength={TITLE_MAX}
                returnKeyType="next"
              />
            </View>
            <Text style={[styles.charCount, { color: colors.muted }]}>
              {title.length} / {TITLE_MAX}
            </Text>

            {/* Description field — temporarily hidden, to be re-enabled later */}

            {/* Save button */}
            <Pressable onPress={handleSave} disabled={updateMutation.isPending}>
              {({ pressed }) => (
                <View
                  style={[
                    styles.saveBtn,
                    { backgroundColor: colors.tint },
                    pressed && { opacity: 0.85 },
                    updateMutation.isPending && styles.saveBtnDisabled,
                  ]}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>保存</Text>
                  )}
                </View>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetInner: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 4,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  input: {
    fontSize: 15,
    paddingVertical: 11,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 110,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  saveBtn: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
