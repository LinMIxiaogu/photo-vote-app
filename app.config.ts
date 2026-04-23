// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "com.cyrus.firstimpression";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
    .split(".")
    .map((segment) => (/^[a-zA-Z]/.test(segment) ? segment : `x${segment}`))
    .join(".") || "com.cyrus.firstimpression";

const schemeSuffix = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const deepLinkScheme = `manus${schemeSuffix}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "一选",
  appSlug: "photo-vote-app",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663314080331/HBXpKIwxMDKVsskD.png",
  scheme: deepLinkScheme,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // 允许查询小红书 URI Scheme（iOS 9+ 需要白名单）
      LSApplicationQueriesSchemes: ["xhsdiscover"],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    [
      "expo-video",
      {
        supportsPictureInPicture: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission:
          "一选需要访问您的照片库，用于：选择照片上传参与投票活动（您主动选取的照片将上传至服务器供其他用户投票）、从相册选取图片设置个人头像、以及提交反馈时附加截图。应用仅读取您明确选择的照片，不会自动扫描或上传您的其他照片。",
        savePhotosPermission:
          "一选需要将图片保存到您的相册，用于保存您的投票结果海报和分享卡片，以便您随时查看或分享至其他社交媒体平台。仅在您主动点击\"保存\"或\"分享\"时才会保存图片。",
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
