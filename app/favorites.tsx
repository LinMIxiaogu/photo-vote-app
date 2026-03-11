import { View, Text, Pressable, StyleSheet, Platform, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useCallback, useState } from "react";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";

const PAGE_SIZE = 8;
const CARD_HEIGHT = 230;

type FavoritePhoto = {
  id: number;
  url: string;
};

type FavoriteCard = {
  id: number;
  totalVotes: number;
  photos: FavoritePhoto[];
};

export default function FavoritesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [localFavoriteOverrides, setLocalFavoriteOverrides] = useState<Record<number, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    error,
    isLoading,
    isRefetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = trpc.favorites.getMyFavorites.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      enabled: !!user,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const favorites: FavoriteCard[] = [];
  const favoriteIds = new Set<number>();

  for (const item of data?.pages.flatMap((page) => page.items) ?? []) {
    if (!item || !Number.isFinite(item.id) || item.id <= 0 || favoriteIds.has(item.id)) {
      continue;
    }

    favoriteIds.add(item.id);
    favorites.push({
      id: item.id,
      totalVotes: Number.isFinite(item.totalVotes) ? item.totalVotes : 0,
      photos: Array.isArray(item.photos)
        ? item.photos
          .filter((photo) => (
            !!photo &&
            typeof photo.id === "number" &&
            typeof photo.url === "string" &&
            photo.url.trim().length > 0
          ))
          .map((photo) => ({
            id: photo.id,
            url: getImageUrl(photo.url),
          }))
        : [],
    });
  }

  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onError: (err, vars) => {
      setLocalFavoriteOverrides((prev) => {
        const next = { ...prev };
        delete next[vars.cardId];
        return next;
      });
      if (Platform.OS === "web") {
        window.alert(err.message || "操作失败");
      }
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLocalFavoriteOverrides({});
    await utils.favorites.getMyFavorites.invalidate();
    await refetch();
    setRefreshing(false);
  }, [refetch, utils.favorites.getMyFavorites]);

  const handleBack = () => {
    router.back();
  };

  const handleCardPress = (cardId: number) => {
    if (!Number.isFinite(cardId) || cardId <= 0) return;
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/result?cardId=${cardId}&from=favorites`);
  };

  const handleToggleFavoriteLocal = (e: unknown, cardId: number) => {
    (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
    if (!user || !Number.isFinite(cardId) || cardId <= 0) return;

    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const currentlyFavorited = localFavoriteOverrides[cardId] !== undefined
      ? localFavoriteOverrides[cardId]
      : true;

    setLocalFavoriteOverrides((prev) => ({ ...prev, [cardId]: !currentlyFavorited }));
    toggleFavoriteMutation.mutate({ cardId });
  };

  const handleLoadMore = () => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  };

  const renderFavoriteCard = ({ item: favorite }: { item: FavoriteCard }) => {
    const isFavorited = localFavoriteOverrides[favorite.id] !== undefined
      ? localFavoriteOverrides[favorite.id]
      : true;
    const previewPhotos = favorite.photos.slice(0, 4);

    return (
      <Pressable
        onPress={() => handleCardPress(favorite.id)}
        style={({ pressed }) => [
          styles.card,
          styles.cardShadow,
          { backgroundColor: colors.background },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.photosGrid}>
          {previewPhotos.length > 0 ? (
            previewPhotos.map((photo, index) => (
              <View
                key={photo.id}
                style={[
                  styles.photoItem,
                  previewPhotos.length === 1 && styles.photoItemSingle,
                  previewPhotos.length === 2 && styles.photoItemHalf,
                  previewPhotos.length === 3 && index === 2 && styles.photoItemFull,
                ]}
              >
                <Image
                  source={{ uri: photo.url }}
                  style={styles.photoImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              </View>
            ))
          ) : (
            <View style={[styles.photoFallback, { backgroundColor: colors.border }]}>
              <IconSymbol name="photo.fill" size={24} color={colors.muted} />
            </View>
          )}
        </View>

        <View style={[styles.cardBar, { borderTopColor: colors.border }]}>
          <View style={styles.cardBarStats}>
            <IconSymbol name="person.2.fill" size={14} color={colors.muted} />
            <Text style={[styles.cardBarText, { color: colors.muted }]}>{favorite.totalVotes} 票</Text>
            <View style={[styles.dot, { backgroundColor: colors.border }]} />
            <IconSymbol name="photo.fill" size={13} color={colors.muted} />
            <Text style={[styles.cardBarText, { color: colors.muted }]}>{favorite.photos.length} 张</Text>
          </View>

          <Pressable
            onPress={(e) => handleToggleFavoriteLocal(e, favorite.id)}
            hitSlop={12}
            style={({ pressed }) => [
              styles.heartButton,
              pressed && styles.heartButtonPressed,
            ]}
          >
            <IconSymbol
              name={isFavorited ? "heart.fill" : "heart"}
              size={18}
              color={isFavorited ? "#EF4444" : "#9CA3AF"}
            />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      className="flex-1"
      style={{ backgroundColor: colors.surface }}
    >
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={[styles.backButton, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <IconSymbol name="arrow.left" size={18} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>我的收藏</Text>
            </View>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>点击卡片查看投票结果与评论</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {isLoading ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>加载中...</Text>
            </View>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>加载失败</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {error.message || "收藏数据暂时不可用，请稍后重试"}
              </Text>
              <Pressable
                onPress={() => void handleRefresh()}
                style={({ pressed }) => [
                  styles.loginButton,
                  { backgroundColor: colors.tint },
                  pressed && styles.loginButtonPressed,
                ]}
              >
                <Text style={styles.loginButtonText}>重新加载</Text>
              </Pressable>
            </View>
          </View>
        ) : !user ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <IconSymbol name="person.fill" size={56} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>请先登录</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>登录后可查看与管理收藏</Text>
              <Pressable
                onPress={() => router.push("/login")}
                style={({ pressed }) => [
                  styles.loginButton,
                  { backgroundColor: colors.tint },
                  pressed && styles.loginButtonPressed,
                ]}
              >
                <Text style={styles.loginButtonText}>去登录</Text>
              </Pressable>
            </View>
          </View>
        ) : favorites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.emptyIconWrap}>
                <IconSymbol name="heart" size={40} color="#EF4444" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>还没有收藏</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>投票后可以收藏感兴趣的内容</Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={favorites}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderFavoriteCard}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={3}
            updateCellsBatchingPeriod={80}
            removeClippedSubviews={Platform.OS !== "web"}
            getItemLayout={(_, index) => ({
              length: CARD_HEIGHT,
              offset: CARD_HEIGHT * index,
              index,
            })}
            refreshing={refreshing || isRefetching}
            onRefresh={handleRefresh}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.35}
            ListFooterComponent={isFetchingNextPage ? (
              <View style={styles.listFooter}>
                <ActivityIndicator size="small" color={colors.tint} />
              </View>
            ) : <View style={styles.listFooterSpacer} />}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  placeholder: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  listFooter: {
    paddingVertical: 8,
  },
  listFooterSpacer: {
    height: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    gap: 10,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(239,68,68,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
  },
  loginButtonPressed: {
    opacity: 0.85,
  },
  loginButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  emptyText: {
    fontSize: 15,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  photosGrid: {
    aspectRatio: 2,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  photoItem: {
    width: "50%",
    height: "50%",
    padding: 1,
  },
  photoItemSingle: {
    width: "100%",
    height: "100%",
  },
  photoItemHalf: {
    width: "50%",
    height: "100%",
  },
  photoItemFull: {
    width: "100%",
    height: "50%",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardBarStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardBarText: {
    fontSize: 13,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 2,
  },
  heartButton: {
    padding: 4,
  },
  heartButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.9 }],
  },
});
