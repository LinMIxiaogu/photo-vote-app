const rawBundleId = "com.cyrus.firstimpression";

export const APP_BUNDLE_ID = rawBundleId
  .replace(/[-_]/g, ".")
  .replace(/[^a-zA-Z0-9.]/g, "")
  .replace(/\.+/g, ".")
  .replace(/^\.+|\.+$/g, "")
  .toLowerCase()
  .split(".")
  .map((segment) => (/^[a-zA-Z]/.test(segment) ? segment : `x${segment}`))
  .join(".") || "com.cyrus.firstimpression";

const schemeSuffix = APP_BUNDLE_ID.split(".").pop()?.replace(/^t/, "") ?? "";

export const APP_DEEP_LINK_SCHEME = `manus${schemeSuffix}`;
