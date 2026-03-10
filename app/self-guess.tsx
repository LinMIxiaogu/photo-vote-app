import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  Image as RNImage,
  TextInput,
  KeyboardAvoidingView,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton } from "@/components/action-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { clearTempPhotos, getTempPhotos } from "@/lib/temp-photos-store";

const TEMP_PHOTOS_KEY = "@temp_photos";

interface PhotoData {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function EditCopyScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("选择你喜欢的");
  const [description, setDescription] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(12)).current;
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);

    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);

    toastOpacity.stopAnimation();
    toastTranslateY.stopAnimation();

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 8,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 1400);
  };

  const createCardMutation = trpc.cards.create.useMutation({
    onSuccess: (data) => {
      if (Platform.OS === "web") clearTempPhotos();
      else AsyncStorage.removeItem(TEMP_PHOTOS_KEY).catch(console.error);

      const successMessage = data?.pendingReview
        ? "发布成功，审核通过后会展示"
        : "发布成功";

      showToast(successMessage);

      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = setTimeout(() => {
        router.replace("/");
      }, 900);
    },
    onError: (error) => {
      const msg = error.message || "创建失败，请重试";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("错误", msg);
    },
  });

  useEffect(() => {
    const loadPhotos = async () => {
      try {
        const memData = getTempPhotos();
        if (memData && memData.length > 0) {
          setPhotos(memData);
          return;
        }

        if (Platform.OS !== "web") {
          const data = await AsyncStorage.getItem(TEMP_PHOTOS_KEY);
          if (data) {
            const parsed = JSON.parse(data);
            setPhotos(parsed);
            return;
          }
        }

        Alert.alert("错误", "未找到照片数据");
      } catch (e) {
        console.error("Failed to load photos:", e);
        Alert.alert("错误", "加载照片失败");
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();

    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  const handleConfirm = () => {
    if (photos.length < 2) {
      const msg = "照片数据异常，请返回重新选择";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("错误", msg);
      return;
    }

    createCardMutation.mutate({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      photos: photos.map((p) => ({
        base64: p.base64,
        mimeType: p.mimeType,
      })),
    });
  };

  const handleBack = () => {
    if (Platform.OS === "web") clearTempPhotos();
    else AsyncStorage.removeItem(TEMP_PHOTOS_KEY).catch(console.error);
    router.back();
  };

  const canConfirm = useMemo(() => photos.length >= 2, [photos.length]);

  if (loading) {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>加载照片中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={styles.backButton}>
              <IconSymbol name="arrow.left" size={24} color="#11181C" />
            </Pressable>
            <Text style={styles.title}>编辑文案</Text>
            <View style={styles.placeholder} />
          </View>

          <Text style={styles.subtitle}>为你的投票卡片添加标题</Text>

          <View style={styles.gridContainer}>
            {photos.map((photo, index) => {
              const imageUri =
                photo.base64 ? `data:${photo.mimeType};base64,${photo.base64}` : photo.uri || "";

              return (
                <View key={`${photo.uri}-${index}`} style={styles.gridItem}>
                  <View style={styles.photoContainer}>
                    {imageUri ? (
                      <RNImage source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <View style={styles.photoFallback} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {photos.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>未找到照片，请返回重选</Text>
              <ActionButton
                title="返回重选"
                onPress={handleBack}
                variant="outline"
                size="medium"
                fullWidth
              />
            </View>
          )}

          <View style={styles.fieldsContainer}>
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>标题</Text>
                <Text style={styles.optionalTag}>选填</Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="给这组照片起一个标题..."
                placeholderTextColor="#9CA3AF"
                value={title}
                onChangeText={setTitle}
                maxLength={15}
                returnKeyType="next"
              />
              <Text style={styles.charCount}>{title.length}/15</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <ActionButton
              title="确认创建"
              onPress={handleConfirm}
              disabled={!canConfirm}
              loading={createCardMutation.isPending}
              size="large"
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toastContainer,
          {
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
          },
        ]}
      >
        <View style={styles.toastInner}>
          <View style={styles.toastDot} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#687076",
    marginTop: 16,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#11181C",
  },
  placeholder: {
    width: 40,
  },
  subtitle: {
    fontSize: 14,
    color: "#687076",
    textAlign: "center",
    marginBottom: 20,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  gridItem: {
    width: "48%",
    aspectRatio: 1,
    marginBottom: 12,
  },
  photoContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E7EB",
  },
  emptyState: {
    marginTop: 24,
    gap: 12,
    alignItems: "center",
    width: "100%",
  },
  emptyText: {
    fontSize: 14,
    color: "#687076",
  },
  fieldsContainer: {
    gap: 20,
    marginTop: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#11181C",
  },
  optionalTag: {
    fontSize: 12,
    color: "#9CA3AF",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  textInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#11181C",
  },
  charCount: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "right",
  },
  footer: {
    marginTop: 28,
    width: "100%",
  },
  toastContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 34,
    alignItems: "center",
    zIndex: 20,
  },
  toastInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "76%",
    backgroundColor: "rgba(17, 24, 28, 0.92)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  toastDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#34D399",
  },
  toastText: {
    color: "#F9FAFB",
    fontSize: 12,
    fontWeight: "600",
  },
});
