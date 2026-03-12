import { memo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { getImageUrl } from "@/lib/utils";

type VotePhoto = {
  id: number;
  url: string;
  photoIndex: number;
  voteCount: number;
};

type VoteCardData = {
  id: number;
  title?: string | null;
  photos: VotePhoto[];
  totalVotes: number;
};

type Props = {
  currentCard: VoteCardData;
  userVotedAt: string | null;
  formatVoteDate: (voteDate: string) => string;
  allPhotoStats: Array<{ id: number; percentage: number; voteCount: number }>;
  selectedPhotoId: number | null;
  voteResult: { percentage: number; voteCount: number; totalVotes: number } | null;
  isFavorited: boolean;
  favoritePending: boolean;
  onToggleFavorite: () => void;
  showComments: boolean;
  commentsCount: number;
  onToggleComments: () => void;
};

export const VoteFlowResultPanel = memo(function VoteFlowResultPanel({
  currentCard,
  userVotedAt,
  formatVoteDate,
  allPhotoStats,
  selectedPhotoId,
  voteResult,
  isFavorited,
  favoritePending,
  showComments,
  commentsCount,
  onToggleComments,
  onToggleFavorite,
}: Props) {
  const title = currentCard.title?.trim() || "投票结果";

  return (
    <>
      <Text style={styles.voteTitle}>{title}</Text>
      {userVotedAt ? (
        <Text style={styles.voteDateSubtitle}>{formatVoteDate(userVotedAt)} 已参与投票</Text>
      ) : null}

      <View style={styles.resultsList}>
        {currentCard.photos.map((photo) => {
          const stats = allPhotoStats.find((item) => item.id === photo.id);
          const isSelected = photo.id === selectedPhotoId;
          const percentage = stats?.percentage ?? voteResult?.percentage ?? 0;
          const voteCount = stats?.voteCount ?? photo.voteCount;

          return (
            <View key={photo.id} style={[styles.resultItem, isSelected && styles.resultItemSelected]}>
              <Image source={{ uri: getImageUrl(photo.url) }} style={styles.resultPhoto} contentFit="cover" />
              <View style={styles.resultStats}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultPercentage}>{percentage}%</Text>
                  <Text style={styles.uploadOrderText}>第 {photo.photoIndex + 1} 张</Text>
                  {isSelected ? (
                    <View style={styles.yourChoiceBadge}>
                      <Text style={styles.yourChoiceText}>你的选择</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.resultVotes}>{voteCount} 票</Text>
                <View style={styles.resultBar}>
                  <View
                    style={[
                      styles.resultBarFill,
                      { width: `${percentage}%` },
                      isSelected && styles.resultBarFillSelected,
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.actionButtonsRow}>
        <Pressable
          onPress={onToggleFavorite}
          disabled={favoritePending}
          style={[styles.actionButton, isFavorited && styles.actionButtonActive]}
        >
          <IconSymbol
            name={isFavorited ? "heart.fill" : "heart"}
            size={20}
            color={isFavorited ? "#EF4444" : "#6366F1"}
          />
          <Text style={[styles.actionButtonText, isFavorited && styles.actionButtonTextActive]}>
            {isFavorited ? "已收藏" : "收藏"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onToggleComments}
          style={[styles.actionButton, showComments && styles.actionButtonActive]}
        >
          <IconSymbol name="bubble.left.fill" size={20} color="#6366F1" />
          <Text style={styles.actionButtonText}>
            评论{commentsCount > 0 ? ` (${commentsCount})` : ""}
          </Text>
        </Pressable>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  voteTitle: {
    fontSize: 28,
    lineHeight: 40,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 20,
  },
  voteDateSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: -14,
    marginBottom: 12,
  },
  resultsList: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 12,
    gap: 16,
  },
  resultItemSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  resultPhoto: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  resultStats: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultPercentage: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
  },
  uploadOrderText: {
    fontSize: 12,
    color: "#CBD5E1",
  },
  yourChoiceBadge: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  yourChoiceText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  resultVotes: {
    fontSize: 14,
    color: "#CBD5E1",
    marginTop: 2,
    marginBottom: 8,
  },
  resultBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  resultBarFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 3,
  },
  resultBarFillSelected: {
    backgroundColor: "#6366F1",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  actionButtonActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  actionButtonTextActive: {
    color: "#ffffff",
  },
});
