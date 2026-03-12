import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";

const USER_AGREEMENT_URL =
  "https://hf7l9aiqzx.feishu.cn/docx/K1bldgZ6dojTcsxpU6Rc4NvCnBh?from=from_copylink";
const PRIVACY_POLICY_URL =
  "https://hf7l9aiqzx.feishu.cn/docx/KkdMdIKSCo7LZmxg2ZjcfhfGnEg?from=from_copylink";

/** 中国大陆手机号：1 开头，第二位 3-9，共 11 位 */
const PHONE_REGEX = /^1[3-9]\d{9}$/;

function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

const CODE_COOLDOWN_SEC = 60;

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [showAgreementPrompt, setShowAgreementPrompt] = useState(false);

  const performSendCode = useCallback(async () => {
    const raw = phone.trim();
    if (!raw) {
      setError("请输入手机号");
      return;
    }
    if (!isValidPhone(raw)) {
      setError("请输入正确的手机号");
      return;
    }
    setError("");
    setSendCodeLoading(true);
    try {
      await Api.sendVerificationCode(raw);
      setCodeCooldown(CODE_COOLDOWN_SEC);
      const timer = setInterval(() => {
        setCodeCooldown((s) => {
          if (s <= 1) {
            clearInterval(timer);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e: any) {
      setError(e?.message || "发送失败");
    } finally {
      setSendCodeLoading(false);
    }
  }, [phone]);

  const handleSendCode = useCallback(async () => {
    if (!agreed) {
      setShowAgreementPrompt(true);
      return;
    }

    await performSendCode();
  }, [agreed, performSendCode]);

  const handleAgreeAndSendCode = useCallback(async () => {
    setAgreed(true);
    setError("");
    setShowAgreementPrompt(false);
    await performSendCode();
  }, [performSendCode]);

  const handleSubmit = async () => {
    const raw = phone.trim();
    if (!raw) {
      setError("请输入手机号");
      return;
    }
    if (!isValidPhone(raw)) {
      setError("请输入正确的手机号");
      return;
    }
    const codeStr = code.trim();
    if (codeStr.length !== 6 || !/^\d{6}$/.test(codeStr)) {
      setError("请输入 6 位验证码");
      return;
    }
    if (!agreed) {
      setError("请先阅读并同意用户协议和隐私政策");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await Api.phoneLoginWithCode(raw, codeStr);

      const userForStorage = {
        ...result.user,
        lastSignedIn: new Date(result.user.lastSignedIn),
      };
      if (result.token && Platform.OS !== "web") {
        await Auth.setSessionToken(result.token);
      }
      await Auth.setUserInfo(userForStorage as Auth.User);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>登录</Text>
          <Text style={styles.subtitle}>
            使用手机号验证码登录，同步你的收藏
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="手机号"
            placeholderTextColor="#9CA3AF"
            value={phone}
            onChangeText={(t) => { setPhone(t.replace(/\D/g, "").slice(0, 11)); setError(""); }}
            keyboardType="phone-pad"
            maxLength={11}
            editable={!loading}
          />
          <View style={styles.codeRow}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="验证码（6 位）"
              placeholderTextColor="#9CA3AF"
              value={code}
              onChangeText={(t) => { setCode(t.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />
            <Pressable
              onPress={handleSendCode}
              disabled={sendCodeLoading || codeCooldown > 0 || !isValidPhone(phone.trim())}
            >
              <View
                style={[
                  styles.sendCodeBtn,
                  (sendCodeLoading || codeCooldown > 0 || !isValidPhone(phone.trim())) &&
                    styles.sendCodeBtnDisabled,
                ]}
              >
                {sendCodeLoading ? (
                  <ActivityIndicator size="small" color="#6366F1" />
                ) : codeCooldown > 0 ? (
                  <Text style={styles.sendCodeText}>{codeCooldown}s 后重发</Text>
                ) : (
                  <Text style={styles.sendCodeText}>获取验证码</Text>
                )}
              </View>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={styles.agreementRow}
            onPress={() => { setAgreed((v) => !v); setError(""); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.agreementText}>
              我已阅读并同意{" "}
              <Text
                style={styles.agreementLink}
                onPress={(e) => { e.stopPropagation?.(); Linking.openURL(USER_AGREEMENT_URL); }}
              >
                用户协议
              </Text>
              {" "}和{" "}
              <Text
                style={styles.agreementLink}
                onPress={(e) => { e.stopPropagation?.(); Linking.openURL(PRIVACY_POLICY_URL); }}
              >
                隐私政策
              </Text>
            </Text>
          </Pressable>

          <Pressable onPress={handleSubmit} disabled={loading || !agreed}>
            {({ pressed }) => (
              <View
                style={[
                  styles.submit,
                  pressed && styles.submitPressed,
                  (loading || !agreed) && styles.submitDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>登录</Text>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showAgreementPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAgreementPrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.agreementModal}>
            <Text style={styles.agreementModalTitle}>请先阅读并同意协议</Text>
            <Text style={styles.agreementModalText}>
              发送验证码前，需要先同意《用户协议》和《隐私政策》。
            </Text>
            <View style={styles.agreementModalActions}>
              <Pressable style={styles.agreementModalAction} onPress={() => setShowAgreementPrompt(false)}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.agreementModalButton,
                      styles.agreementModalButtonSecondary,
                      pressed && styles.submitPressed,
                    ]}
                  >
                    <Text style={styles.agreementModalButtonSecondaryText}>拒绝</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.agreementModalAction} onPress={handleAgreeAndSendCode}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.agreementModalButton,
                      styles.agreementModalButtonPrimary,
                      pressed && styles.submitPressed,
                    ]}
                  >
                    <Text style={styles.agreementModalButtonPrimaryText}>同意</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 16,
    marginBottom: 32,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#11181C",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#687076",
    lineHeight: 20,
  },
  form: {
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#11181C",
  },
  codeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  codeInput: {
    flex: 1,
  },
  sendCodeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#6366F1",
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  sendCodeBtnDisabled: {
    borderColor: "#E5E7EB",
    opacity: 0.7,
  },
  sendCodeText: {
    fontSize: 14,
    color: "#6366F1",
    fontWeight: "600",
  },
  error: {
    fontSize: 14,
    color: "#EF4444",
    marginTop: -4,
  },
  submit: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  submitPressed: {
    opacity: 0.9,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  agreementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: -4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },
  checkmark: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "700",
    lineHeight: 16,
  },
  agreementText: {
    fontSize: 13,
    color: "#687076",
    flex: 1,
    lineHeight: 20,
  },
  agreementLink: {
    color: "#6366F1",
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,28,0.18)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  agreementModal: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  agreementModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#11181C",
  },
  agreementModalText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#687076",
    marginTop: 10,
  },
  agreementModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  agreementModalButton: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  agreementModalAction: {
    flex: 1,
  },
  agreementModalButtonSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  agreementModalButtonPrimary: {
    backgroundColor: "#6366F1",
    borderWidth: 1,
    borderColor: "#6366F1",
  },
  agreementModalButtonSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#11181C",
  },
  agreementModalButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
