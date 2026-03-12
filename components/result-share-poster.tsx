import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { getImageUrl } from "@/lib/utils";

type Photo = {
  id: number;
  url: string;
  photoIndex: number;
  voteCount: number;
};

type Props = {
  displayPhotos: Photo[];
  leaderVoteCount: number;
  leadingPhoto: Photo | null;
  totalVotes: number;
};

export const ResultSharePoster = forwardRef<View, Props>(function ResultSharePoster(
  { displayPhotos, leaderVoteCount, leadingPhoto, totalVotes },
  ref,
) {
  return (
    <View pointerEvents="none" style={styles.sharePosterStage}>
      <View ref={ref} collapsable={false} style={styles.sharePosterCard}>
        <View style={styles.sharePosterHero}>
          <View style={styles.sharePosterHeroFrame}>
            {leadingPhoto ? (
              <Image source={{ uri: getImageUrl(leadingPhoto.url) }} style={styles.sharePosterHeroImage} contentFit="contain" />
            ) : (
              <View style={styles.sharePosterHeroFallback} />
            )}
          </View>
        </View>
        <View style={styles.sharePosterBody}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sharePosterTitle}>投票结果</Text>
            <Text style={styles.sharePosterMeta}>{totalVotes} 人参与</Text>
          </View>
          <View style={styles.sharePosterResultList}>
            {displayPhotos.map((photo) => {
              const percentage = totalVotes > 0 ? Math.round((photo.voteCount / totalVotes) * 100) : 0;
              const isLeader = leaderVoteCount > 0 && photo.voteCount === leaderVoteCount;
              return (
                <View key={`share-${photo.id}`} style={styles.sharePosterResultRow}>
                  <View style={styles.sharePosterThumbWrap}>
                    <View style={styles.sharePosterThumbFrame}>
                      <Image source={{ uri: getImageUrl(photo.url) }} style={styles.sharePosterThumb} contentFit="contain" />
                    </View>
                  </View>
                  <View style={styles.sharePosterResultMain}>
                    <View style={styles.resultLabels}>
                      <Text style={styles.sharePosterOptionLabel}>选项 {photo.photoIndex + 1}</Text>
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
                  <Text style={styles.sharePosterVotes}>{photo.voteCount}票</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sharePosterStage: { position: "absolute", left: -9999, top: 0, opacity: 1 },
  sharePosterCard: { width: 360, backgroundColor: "#FFF8EF", borderRadius: 32, overflow: "hidden" },
  sharePosterHero: { position: "relative", backgroundColor: "#F3E7D8", alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 18 },
  sharePosterHeroFrame: { width: "100%", height: 380, borderRadius: 24, backgroundColor: "#FFFDF8", overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 16 },
  sharePosterHeroImage: { width: "100%", height: "100%" },
  sharePosterHeroFallback: { width: "100%", height: "100%", backgroundColor: "#F1E6D8", borderRadius: 18 },
  sharePosterBody: { paddingHorizontal: 22, paddingVertical: 22, gap: 16 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sharePosterTitle: { fontSize: 26, fontWeight: "800", color: "#27211B" },
  sharePosterMeta: { fontSize: 13, color: "#8C877F" },
  sharePosterResultList: { gap: 14 },
  sharePosterResultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sharePosterThumbWrap: { width: 74, height: 74, alignItems: "center", justifyContent: "center" },
  sharePosterThumbFrame: { width: "100%", height: "100%", borderRadius: 16, backgroundColor: "#FFFDF8", overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 6 },
  sharePosterThumb: { width: "100%", height: "100%" },
  sharePosterResultMain: { flex: 1, gap: 8 },
  resultLabels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sharePosterOptionLabel: { fontSize: 14, fontWeight: "600", color: "#544A42" },
  resultValue: { fontSize: 16, fontWeight: "800", color: "#27211B" },
  resultTrack: { height: 10, borderRadius: 999, backgroundColor: "#EFE4D6", overflow: "hidden" },
  resultFill: { height: "100%", borderRadius: 999 },
  resultFillLeader: { backgroundColor: "#C85C3C" },
  resultFillDefault: { backgroundColor: "#D8A28F" },
  sharePosterVotes: { width: 42, textAlign: "right", fontSize: 13, color: "#8C877F" },
});