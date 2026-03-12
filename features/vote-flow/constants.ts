import { Dimensions, Platform } from "react-native";

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const IOS_SWIPE_THRESHOLD_RATIO = 0.045;
const DEFAULT_SWIPE_THRESHOLD_RATIO = 0.08;

export const SWIPE_THRESHOLD =
  SCREEN_HEIGHT * (Platform.OS === "ios" ? IOS_SWIPE_THRESHOLD_RATIO : DEFAULT_SWIPE_THRESHOLD_RATIO);
export const BATCH_SIZE = 50;
export const QUEUE_MAX = 200;
export const QUEUE_KEEP = 50;
export const REFILL_THRESHOLD = 5;
export const INITIAL_FETCH_TIMEOUT_MS = 12000;
