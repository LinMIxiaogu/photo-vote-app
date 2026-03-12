import type { RefObject } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Image } from "expo-image";

import { IconSymbol } from "@/components/ui/icon-symbol";

type ReplyingTo = {
  parentCommentId: number;
  userName: string;
  replyToUserId?: number | null;
} | null;

type Props = {
  borderTopColor: string;
  bottomOffset?: number;
  commentCount: number;
  commentImages: string[];
  commentText: string;
  commentUploading: boolean;
  favoriteCount: number;
  inputRef: RefObject<TextInput | null>;
  isComposerExpanded: boolean;
  isFavorited: boolean;
  isPickingImage: boolean;
  isSubmitting: boolean;
  onBlurRestorePending: boolean;
  onChangeText: (text: string) => void;
  onFocusComposer: () => void;
  onOpenComposer: (focusInput: boolean) => void;
  onPickImage: () => void;
  onRemoveImage: (index: number) => void;
  onSubmit: () => void;
  onToggleFavorite: () => void;
  replyingTo: ReplyingTo;
  setComposerExpanded: (expanded: boolean) => void;
  setReplyingTo: (value: ReplyingTo) => void;
  userEnabled: boolean;
};

export function ResultCommentComposer({
  borderTopColor,
  bottomOffset,
  commentCount,
  commentImages,
  commentText,
  commentUploading,
  favoriteCount,
  inputRef,
  isComposerExpanded,
  isFavorited,
  isPickingImage,
  isSubmitting,
  onBlurRestorePending,
  onChangeText,
  onFocusComposer,
  onOpenComposer,
  onPickImage,
  onRemoveImage,
  onSubmit,
  onToggleFavorite,
  replyingTo,
  setComposerExpanded,
  setReplyingTo,
  userEnabled,
}: Props) {
  const canPickImage = userEnabled && commentImages.length < 2 && !commentUploading && !isSubmitting;
  const canSendComment = userEnabled && (!!commentText.trim() || commentImages.length > 0) && !isSubmitting && !commentUploading;

  return (
    <View
      style={[
        styles.bottomComposer,
        isComposerExpanded && styles.bottomComposerFloating,
        {
          borderTopColor,
          ...(isComposerExpanded && bottomOffset ? { bottom: bottomOffset } : {}),
        },
      ]}
    >
      {replyingTo ? (
        <View style={styles.replyingBanner}>
          <Text style={styles.replyingBannerText}>闂傚倷鐒﹂幃鍫曞磿閹惰棄纾绘繛鎴旀嚍?@{replyingTo.userName}</Text>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
            <IconSymbol name="xmark" size={16} color="#8C877F" />
          </Pressable>
        </View>
      ) : null}

      {isComposerExpanded && commentImages.length > 0 ? (
        <View style={styles.composerImagePreviewRow}>
          {commentImages.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.composerImagePreviewWrap}>
              <Image source={{ uri }} style={styles.composerImagePreview} contentFit="cover" />
              <Pressable style={styles.composerImageRemoveBtn} onPress={() => onRemoveImage(index)} hitSlop={8}>
                <IconSymbol name="xmark.circle.fill" size={18} color="#6B7280" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.composerCard, isComposerExpanded ? styles.composerCardExpanded : styles.composerCardCollapsed]}>
        <Pressable style={styles.composerInputWrap} onPress={() => onOpenComposer(true)}>
          {!isComposerExpanded ? <IconSymbol name="square.and.pencil" size={18} color="#8C877F" /> : null}
          <TextInput
            ref={inputRef}
            style={[styles.composerInput, isComposerExpanded ? styles.composerExpandedInput : styles.composerCollapsedInputText]}
            placeholder={userEnabled ? "闂傚倷绀侀幖顐︽偋閸℃蛋鍥箮閼恒儱鍓ㄩ梺浼欑到閺堫剟宕崫鍔藉綊鏁愰崶鈺傛啒闂佹悶鍊栭惄顖炲蓟閵娿儮妲堟俊顖氱仢椤忣參姊洪崷顓炲姦闁哄懐濮撮锝夊醇閺囩倣銊╂煏婵炑冨濞肩娀姊?" : "闂傚倷娴囬惃顐﹀幢閳轰焦顔勭紓鍌氬€哥粔瀵哥矓閻熸壆鏆﹂柕澶涢檮閸庣喖鏌嶉妷銉ф瀮妞ゆ柨顦扮换娑氣偓鐢殿焾琚ㄩ梺绋垮閹告娊骞嗘担瑙勫劅闁挎繂妫楅?"}
            placeholderTextColor="#B0AAA2"
            value={commentText}
            onChangeText={onChangeText}
            onFocus={onFocusComposer}
            onBlur={() => {
              if (!commentText.trim() && commentImages.length === 0 && !replyingTo && !isPickingImage && !onBlurRestorePending) {
                setComposerExpanded(false);
                setReplyingTo(null);
                Keyboard.dismiss();
              }
            }}
            editable={userEnabled}
            multiline
            maxLength={500}
          />
        </Pressable>
        {isComposerExpanded ? (
          <View style={styles.composerExpandedActions}>
            <Pressable
              onPress={onPickImage}
              disabled={!canPickImage}
              style={[styles.composerActionIconBtn, !canPickImage && styles.circleButtonDisabled]}
            >
              {commentUploading ? (
                <ActivityIndicator size="small" color="#8A4B38" />
              ) : (
                <IconSymbol name="photo.fill" size={20} color={canPickImage ? "#8A4B38" : "#B0AAA2"} />
              )}
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={!canSendComment}
              style={[styles.sendTextButton, canSendComment ? styles.sendTextButtonActive : styles.sendTextButtonDisabled]}
            >
              {isSubmitting ? <ActivityIndicator size="small" color="#FFF7EE" /> : <Text style={styles.sendTextButtonLabel}>闂傚倷绀侀幉锟犳偡閿曞倸鍨傞柛褎顨呴悞?</Text>}
            </Pressable>
          </View>
        ) : null}
      </View>

      {!isComposerExpanded ? (
        <View style={styles.composerCollapsedMetaRow}>
          <Pressable onPress={onToggleFavorite} disabled={isSubmitting} style={styles.composerMetaBtn}>
            {isSubmitting ? <ActivityIndicator size="small" color="#8A4B38" /> : <IconSymbol name={isFavorited ? "heart.fill" : "heart"} size={22} color={isFavorited ? "#C85C3C" : "#5D5147"} />}
            <Text style={styles.composerMetaText}>{favoriteCount}</Text>
          </Pressable>
          <Pressable onPress={() => onOpenComposer(false)} style={styles.composerMetaBtn}>
            <IconSymbol name="bubble.left" size={22} color="#5D5147" />
            <Text style={styles.composerMetaText}>{commentCount}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomComposer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "rgba(255,255,255,0.98)", borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  bottomComposerFloating: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20 },
  replyingBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, backgroundColor: "#F5E9DA", paddingHorizontal: 12, paddingVertical: 8 },
  replyingBannerText: { fontSize: 12, fontWeight: "700", color: "#8A4B38" },
  composerCard: { borderRadius: 24, backgroundColor: "#F4F1EC", paddingHorizontal: 16, gap: 12 },
  composerCardCollapsed: { minHeight: 42, justifyContent: "center", paddingTop: 0, paddingBottom: 0 },
  composerCardExpanded: { paddingTop: 14, paddingBottom: 10 },
  composerInputWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  composerInput: { flex: 1, fontSize: 15, lineHeight: 22, color: "#2F2822", textAlignVertical: "top" },
  composerCollapsedInputText: { minHeight: 22, maxHeight: 44, paddingTop: 0, paddingBottom: 0 },
  composerCollapsedMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 14 },
  composerMetaBtn: { minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  composerMetaText: { fontSize: 15, fontWeight: "600", color: "#3E342D" },
  composerImagePreviewRow: { flexDirection: "row", gap: 10 },
  composerImagePreviewWrap: { position: "relative" },
  composerImagePreview: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#EDE7E0" },
  composerImageRemoveBtn: { position: "absolute", top: -6, right: -6, backgroundColor: "#FFFFFF", borderRadius: 10 },
  composerExpandedInput: { minHeight: 72, maxHeight: 120, paddingTop: 0, paddingBottom: 0 },
  composerExpandedActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composerActionIconBtn: { minWidth: 56, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7CFC5", backgroundColor: "#FFFDFC" },
  circleButtonDisabled: { opacity: 0.45 },
  sendTextButton: { minWidth: 84, height: 40, borderRadius: 20, backgroundColor: "#F3B7C2", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  sendTextButtonActive: { backgroundColor: "#E97F98" },
  sendTextButtonDisabled: { backgroundColor: "#E7D4D8" },
  sendTextButtonLabel: { fontSize: 16, fontWeight: "700", color: "#FFF7EE" },
});
