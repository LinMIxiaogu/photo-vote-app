import { memo, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, type GestureResponderEvent } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Image } from "expo-image";
import { getImageUrl } from "@/lib/utils";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const TAP_MOVE_TOLERANCE = 12;
const loadedVotePhotoUris = new Set<string>();

type VotePhoto = {
  id: number;
  url: string;
  photoIndex: number;
  voteCount: number;
};

export type VoteCardStackCard = {
  id: number;
  title?: string | null;
  photos: VotePhoto[];
  totalVotes: number;
};

type Props = {
  currentCard: VoteCardStackCard;
  nextCard: VoteCardStackCard | null;
  selectedPhotoId: number | null;
  onPhotoPress: (photoId: number, photoIndex: number) => void;
  translateY: SharedValue<number>;
  showNextCard: SharedValue<boolean>;
};

export const VoteCardStack = memo(function VoteCardStack({
  currentCard,
  nextCard,
  selectedPhotoId,
  onPhotoPress,
  translateY,
  showNextCard,
}: Props) {
  const currentCardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const nextCardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: showNextCard.value
        ? (translateY.value < 0 ? SCREEN_HEIGHT + translateY.value : SCREEN_HEIGHT)
        : SCREEN_HEIGHT,
    }],
  }));

  return (
    <View style={styles.stack}>
      <Animated.View style={[styles.layer, currentCardAnimatedStyle]}>
        <MemoVoteCardContent
          card={currentCard}
          selectedPhotoId={selectedPhotoId}
          onPhotoPress={onPhotoPress}
          interactive
        />
      </Animated.View>
      {nextCard ? (
        <Animated.View pointerEvents="none" style={[styles.layer, nextCardAnimatedStyle]}>
          <MemoVoteCardContent
            card={nextCard}
            selectedPhotoId={selectedPhotoId}
            onPhotoPress={onPhotoPress}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

type VoteCardContentProps = {
  card: VoteCardStackCard;
  selectedPhotoId: number | null;
  onPhotoPress: (photoId: number, photoIndex: number) => void;
  interactive?: boolean;
};

function VoteCardContent({
  card,
  selectedPhotoId,
  onPhotoPress,
  interactive = false,
}: VoteCardContentProps) {
  const title = card.title || "选择你喜欢的";
  const count = card.photos.length;
  const pressStateRef = useRef<Record<number, { startX: number; startY: number; moved: boolean }>>({});

  const beginPress = (photoId: number, event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    pressStateRef.current[photoId] = { startX: pageX, startY: pageY, moved: false };
  };

  const updatePressMovement = (photoId: number, event: GestureResponderEvent) => {
    const state = pressStateRef.current[photoId];
    if (!state || state.moved) return;

    const { pageX, pageY } = event.nativeEvent;
    if (
      Math.abs(pageX - state.startX) > TAP_MOVE_TOLERANCE ||
      Math.abs(pageY - state.startY) > TAP_MOVE_TOLERANCE
    ) {
      state.moved = true;
    }
  };

  const shouldHandlePress = (photoId: number) => {
    const state = pressStateRef.current[photoId];
    delete pressStateRef.current[photoId];
    return !state?.moved;
  };

  const renderCard = (photo: VotePhoto, style: object, photoIndex: number) => (
    <View key={photo.id} style={[styles.photoCard, style]}>
      <Pressable
        onPressIn={interactive ? (event) => beginPress(photo.id, event) : undefined}
        onPressOut={interactive ? (event) => updatePressMovement(photo.id, event) : undefined}
        onTouchMove={interactive ? (event) => updatePressMovement(photo.id, event) : undefined}
        onPress={interactive ? () => {
          if (!shouldHandlePress(photo.id)) return;
          onPhotoPress(photo.id, photoIndex);
        } : undefined}
        disabled={!interactive || selectedPhotoId !== null}
        style={styles.photoCardPressable}
      >
        <View style={styles.photoImageWrap}>
          <MemoVotePhoto photo={photo} />
        </View>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.content}>
      <Text style={[styles.voteTitle, title.length > 8 && styles.voteTitleSmall]}>{title}</Text>
      <Text style={styles.voteSubtitle}>单击投票，双击查看图片</Text>
      {count === 4 ? (
        <View style={styles.photoBlockOffset}>
          <View style={styles.photosGridTwoColumn}>
            {[card.photos.slice(0, 2), card.photos.slice(2, 4)].map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.photoRow}>
                {row.map((photo) => renderCard(photo, styles.photoCardGrid, card.photos.indexOf(photo)))}
              </View>
            ))}
          </View>
        </View>
      ) : count === 3 ? (
        <View style={styles.photoBlockOffset}>
          <View style={styles.photosGridTwoColumn}>
            <View style={styles.photoRow}>
              {card.photos.slice(0, 2).map((photo) => renderCard(photo, styles.photoCardGrid, card.photos.indexOf(photo)))}
            </View>
            <View style={styles.photoRowCenter}>
              {card.photos.slice(2, 3).map((photo) => renderCard(photo, styles.photoCardGrid, card.photos.indexOf(photo)))}
            </View>
          </View>
        </View>
      ) : (
        <View style={count === 2 ? styles.photoBlockOffsetTwo : styles.photoBlockOffset}>
          <View style={[styles.photosGrid, styles.photosGridSingleColumn]}>
            {card.photos.map((photo, idx) =>
              renderCard(photo, count === 2 ? styles.photoCardLarge : styles.photoCardFull, idx)
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const MemoVoteCardContent = memo(
  VoteCardContent,
  (prev, next) =>
    prev.card === next.card &&
    prev.selectedPhotoId === next.selectedPhotoId &&
    prev.onPhotoPress === next.onPhotoPress &&
    prev.interactive === next.interactive
);

const VotePhotoImage = memo(function VotePhotoImage({ photo }: { photo: VotePhoto }) {
  const uri = getImageUrl(photo.url);
  const [loaded, setLoaded] = useState(() => loadedVotePhotoUris.has(uri));

  useEffect(() => {
    setLoaded(loadedVotePhotoUris.has(uri));
  }, [uri]);

  const markLoaded = () => {
    loadedVotePhotoUris.add(uri);
    setLoaded(true);
  };

  return (
    <View style={styles.photoImageFrame}>
      {!loaded ? <View style={styles.photoPlaceholder} /> : null}
      <Image
        source={{ uri }}
        style={styles.photoImage}
        contentFit="cover"
        transition={loaded ? 0 : 120}
        cachePolicy="memory-disk"
        recyclingKey={String(photo.id)}
        onLoad={markLoaded}
        onDisplay={markLoaded}
        onError={(e) => {
          markLoaded();
          console.warn("[vote-flow] image load failed", {
            photoId: photo.id,
            url: uri,
            error: e,
          });
        }}
      />
    </View>
  );
});

const MemoVotePhoto = memo(VotePhotoImage, (prev, next) => prev.photo.id === next.photo.id && prev.photo.url === next.photo.url);

const styles = StyleSheet.create({
  stack: {
    flex: 1,
    overflow: "visible",
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
  },
  content: {
    flex: 1,
    width: "100%",
  },
  voteTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginTop: -SCREEN_HEIGHT * 0.05,
    marginBottom: 20,
  },
  voteTitleSmall: {
    fontSize: 22,
  },
  voteSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: -12,
    marginBottom: 12,
  },
  photosGrid: {
    paddingBottom: 24,
    gap: 12,
  },
  photosGridSingleColumn: {
    flexDirection: "column",
    alignItems: "center",
  },
  photoBlockOffset: {
    marginTop: SCREEN_HEIGHT * 0.05,
  },
  photoBlockOffsetTwo: {
    marginTop: SCREEN_HEIGHT * 0.02,
  },
  photosGridTwoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
    width: "100%",
  },
  photoRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  photoRowCenter: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
  },
  photoCard: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 0,
    borderWidth: 0,
    borderColor: "transparent",
    aspectRatio: 1,
    overflow: "hidden",
  },
  photoCardPressable: {
    flex: 1,
  },
  photoCardGrid: {
    width: "49%",
    aspectRatio: 1,
    flexBasis: "49%",
  },
  photoCardLarge: {
    width: "80%",
    aspectRatio: 1,
    alignSelf: "center",
  },
  photoCardFull: {
    width: "100%",
    aspectRatio: 1,
  },
  photoImageWrap: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImageFrame: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  photoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#20243b",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
});
