import type { RefObject } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";

import { IconSymbol } from "@/components/ui/icon-symbol";

type ReplyingTo = {
  parentCommentId: number;
  userName: string;
  replyToUserId?: number | null;
} | null;

type Props = {
  borderTopColor: string;
  bottomInset: number;
  commentCount: number;
  commentImages: string[];
  commentText: string;
  commentUploading: boolean;
  favoriteCount: number;
  inputRef: RefObject<TextInput | null>;
  isComposerExpanded: boolean;
  isFavorited: boolean;
  isSubmittingComment: boolean;
  isSubmittingFavorite: boolean;
  keyboardHeight: number;
  onChangeText: (text: string) => void;
  onClearReplyingTo: () => void;
  onOpenComments: (focusInput?: boolean) => void;
  onPickImage: () => void;
  onRemoveImage: (index: number) => void;
  onSubmit: () => void;
  onToggleFavorite: () => void;
  replyingTo: ReplyingTo;
  userEnabled: boolean;
};

export function ResultBottomComposer({
  borderTopColor,
  bottomInset,
  commentCount,
  commentImages,
  commentText,
  commentUploading,
  favoriteCount,
  inputRef,
  isComposerExpanded,
  isFavorited,
  isSubmittingComment,
  isSubmittingFavorite,
  keyboardHeight,
  onChangeText,
  onClearReplyingTo,
  onOpenComments,
  onPickImage,
  onRemoveImage,
  onSubmit,
  onToggleFavorite,
  replyingTo,
  userEnabled,
}: Props) {
  const canSendComment =
    userEnabled && (!!commentText.trim() || commentImages.length > 0) && !isSubmittingComment && !commentUploading;

  return (
    <View
      style={[
        styles.bottomComposer,
        isComposerExpanded && styles.bottomComposerFloating,
        {
          borderTopColor,
          paddingBottom: Math.max(bottomInset, 10),
          bottom: isComposerExpanded ? Math.max(keyboardHeight, 0) : 0,
        },
      ]}
    >
      {isComposerExpanded ? (
        <>
          {replyingTo ? (
            <View style={styles.replyingBanner}>
              <Text style={styles.replyingBannerText}>回复 @{replyingTo.userName}</Text>
              <Pressable onPress={onClearReplyingTo} hitSlop={8}>
                <IconSymbol name="xmark" size={16} color="#8C877F" />
              </Pressable>
            </View>
          ) : null}

          {commentImages.length > 0 ? (
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

          <View style={styles.composerExpandedCard}>
            <TextInput
              ref={inputRef}
              style={styles.composerExpandedInput}
              placeholder={userEnabled ? "写下你的看法..." : "登录后参与评论"}
              placeholderTextColor="#B0AAA2"
              value={commentText}
              onChangeText={onChangeText}
              editable={userEnabled}
              multiline
              autoFocus
              maxLength={500}
            />
            <View style={styles.composerExpandedActions}>
              <Pressable
                onPress={onPickImage}
                disabled={!userEnabled || commentImages.length >= 2 || commentUploading || isSubmittingComment}
                style={[
                  styles.composerActionIconBtn,
                  (!userEnabled || commentImages.length >= 2 || commentUploading || isSubmittingComment) &&
                    styles.circleButtonDisabled,
                ]}
              >
                {commentUploading ? (
                  <ActivityIndicator size="small" color="#8A4B38" />
                ) : (
                  <IconSymbol
                    name="photo.fill"
                    size={20}
                    color={userEnabled && commentImages.length < 2 ? "#8A4B38" : "#B0AAA2"}
                  />
                )}
              </Pressable>
              <Pressable
                onPress={onSubmit}
                disabled={!canSendComment}
                style={[styles.sendTextButton, canSendComment ? styles.sendTextButtonActive : styles.sendTextButtonDisabled]}
              >
                {isSubmittingComment ? (
                  <ActivityIndicator size="small" color="#FFF7EE" />
                ) : (
                  <Text style={styles.sendTextButtonLabel}>发送</Text>
                )}
              </Pressable>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.composerCollapsedRow}>
          <Pressable style={styles.composerCollapsedInput} onPress={() => onOpenComments(true)}>
            <IconSymbol name="square.and.pencil" size={18} color="#8C877F" />
            <Text style={styles.composerCollapsedPlaceholder}>说点什么...</Text>
          </Pressable>
          <Pressable onPress={onToggleFavorite} disabled={isSubmittingFavorite} style={styles.composerMetaBtn}>
            {isSubmittingFavorite ? (
              <ActivityIndicator size="small" color="#8A4B38" />
            ) : (
              <IconSymbol
                name={isFavorited ? "heart.fill" : "heart"}
                size={22}
                color={isFavorited ? "#C85C3C" : "#5D5147"}
              />
            )}
            <Text style={styles.composerMetaText}>{favoriteCount}</Text>
          </Pressable>
          <Pressable onPress={() => onOpenComments(false)} style={styles.composerMetaBtn}>
            <IconSymbol name="bubble.left" size={22} color="#5D5147" />
            <Text style={styles.composerMetaText}>{commentCount}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomComposer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "rgba(255,255,255,0.98)", borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  bottomComposerFloating: { position: "absolute", left: 0, right: 0, zIndex: 20, elevation: 20 },
  replyingBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, backgroundColor: "#F5E9DA", paddingHorizontal: 12, paddingVertical: 8 },
  replyingBannerText: { fontSize: 12, fontWeight: "700", color: "#8A4B38" },
  composerCollapsedRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  composerCollapsedInput: { flex: 1, height: 42, borderRadius: 22, backgroundColor: "#F4F1EC", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  composerCollapsedPlaceholder: { fontSize: 15, color: "#9C948B" },
  composerMetaBtn: { minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  composerMetaText: { fontSize: 15, fontWeight: "600", color: "#3E342D" },
  composerImagePreviewRow: { flexDirection: "row", gap: 10 },
  composerImagePreviewWrap: { position: "relative" },
  composerImagePreview: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#EDE7E0" },
  composerImageRemoveBtn: { position: "absolute", top: -6, right: -6, backgroundColor: "#FFFFFF", borderRadius: 10 },
  composerExpandedCard: { borderRadius: 24, backgroundColor: "#F4F1EC", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 },
  composerExpandedInput: { minHeight: 72, maxHeight: 120, fontSize: 15, lineHeight: 22, color: "#2F2822", textAlignVertical: "top", paddingTop: 0, paddingBottom: 0 },
  composerExpandedActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composerActionIconBtn: { minWidth: 56, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7CFC5", backgroundColor: "#FFFDFC" },
  circleButtonDisabled: { opacity: 0.45 },
  sendTextButton: { minWidth: 84, height: 40, borderRadius: 20, backgroundColor: "#F3B7C2", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  sendTextButtonActive: { backgroundColor: "#E97F98" },
  sendTextButtonDisabled: { backgroundColor: "#E7D4D8" },
  sendTextButtonLabel: { fontSize: 16, fontWeight: "700", color: "#FFF7EE" },
});