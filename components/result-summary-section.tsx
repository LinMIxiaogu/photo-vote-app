import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { getImageUrl } from "@/lib/utils";

type VotePhoto = {
  id: number;
  url: string;
  photoIndex: number;
  voteCount: number;
};

type Props = {
  displayPhotos: VotePhoto[];
  leaderVoteCount: number;
  selectedPhotoId: number | null;
  totalVotes: number;
  voteDateLabel?: string | null;
};

export function ResultSummarySection({
  displayPhotos,
  leaderVoteCount,
  selectedPhotoId,
  totalVotes,
  voteDateLabel,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionTitleRow, styles.sectionTitleRowSplit]}>
        <Text style={styles.sectionTitle}>投票结果</Text>
        <Text style={styles.sectionMeta}>{totalVotes} 人参与</Text>
      </View>
      {voteDateLabel ? <Text style={styles.voteDateText}>你的投票时间：{voteDateLabel}</Text> : null}
      <View style={styles.resultList}>
        {displayPhotos.map((photo) => {
          const percentage = totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0;
          const isLeader = leaderVoteCount > 0 && photo.voteCount === leaderVoteCount;
          const isSelected = selectedPhotoId === photo.id;

          return (
            <View key={photo.id} style={[styles.resultRow, isSelected && styles.resultRowSelected]}>
              <View style={styles.resultThumbWrap}>
                <Image source={{ uri: getImageUrl(photo.url) }} style={styles.resultThumb} contentFit="cover" />
              </View>
              <View style={styles.resultMain}>
                <View style={styles.resultLabels}>
                  {isSelected ? <Text style={styles.selectedTag}>你的选择</Text> : <View />}
                  <Text style={styles.resultValue}>{percentage}%</Text>
                </View>
                <View style={styles.resultTrack}>
                  <View
                    style={[
                      styles.resultFill,
                      isLeader ? styles.resultFillLeader : styles.resultFillDefault,
                      { width: `${Math.max(percentage, 6)}%` },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.resultVotes}>{photo.voteCount}票</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 18, paddingVertical: 18, gap: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center" },
  sectionTitleRowSplit: { justifyContent: "space-between" },
  sectionTitle: { fontSize: 24, fontWeight: "800", color: "#27211B" },
  sectionMeta: { fontSize: 13, color: "#8C877F" },
  voteDateText: { marginTop: -6, fontSize: 12, color: "#8A4B38" },
  resultList: { gap: 14 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  resultRowSelected: {
    backgroundColor: "#FFF4EE",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultThumbWrap: { width: 58, height: 58, position: "relative" },
  resultThumb: { width: 58, height: 58, borderRadius: 16 },
  resultMain: { flex: 1, gap: 8 },
  resultLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedTag: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF8EF",
    backgroundColor: "#C85C3C",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  resultValue: { fontSize: 16, fontWeight: "800", color: "#27211B" },
  resultTrack: { height: 10, borderRadius: 999, backgroundColor: "#EFE4D6", overflow: "hidden" },
  resultFill: { height: "100%", borderRadius: 999 },
  resultFillLeader: { backgroundColor: "#C85C3C" },
  resultFillDefault: { backgroundColor: "#D8A28F" },
  resultVotes: { width: 42, textAlign: "right", fontSize: 13, color: "#8C877F" },
});