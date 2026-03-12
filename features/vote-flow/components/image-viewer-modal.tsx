import { memo, RefObject, useCallback, useEffect, useRef } from "react";
import { Modal, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from "react-native";
import { Image } from "expo-image";

import { getImageUrl } from "@/lib/utils";
import type { VoteCardPhoto } from "@/features/vote-flow/types";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/features/vote-flow/constants";

type Props = {
  visible: boolean;
  photos: VoteCardPhoto[];
  scrollRef: RefObject<ScrollView | null>;
  onClose: () => void;
  onMomentumScrollEnd: (index: number) => void;
};

export const ImageViewerModal = memo(function ImageViewerModal({
  visible,
  photos,
  scrollRef,
  onClose,
  onMomentumScrollEnd,
}: Props) {
  const closeInFlightRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closeInFlightRef.current = false;
    }
  }, [photos.length, visible]);

  const handleClosePress = useCallback(() => {
    if (closeInFlightRef.current) return;
    closeInFlightRef.current = true;
    onClose();
  }, [onClose]);

  const handleMomentumScrollEnd = useCallback((index: number) => {
    if (!visible || closeInFlightRef.current) {
      return;
    }
    onMomentumScrollEnd(index);
  }, [onMomentumScrollEnd, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={handleClosePress}>
        <View style={styles.imageViewerOverlay}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.imageViewerScroll}
            contentContainerStyle={styles.imageViewerScrollContent}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              handleMomentumScrollEnd(index);
            }}
            scrollEventThrottle={16}
          >
            {photos.map((item) => (
              <View key={item.id} style={styles.imageViewerPage}>
              <Image
                source={{ uri: getImageUrl(item.url) }}
                style={styles.imageViewerImage}
                contentFit="contain"
              />
              </View>
            ))}
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

const styles = StyleSheet.create({
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "#000000",
  },
  imageViewerScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  imageViewerScrollContent: {
    flexDirection: "row",
  },
  imageViewerPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  imageViewerImage: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
});
