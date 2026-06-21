import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useOAuth, useAuth, useSignUp } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

WebBrowser.maybeCompleteAuthSession();

type Tab = "social" | "email" | "phone";

function getClerkError(err: any): string {
  if (err?.errors?.[0]?.longMessage) return err.errors[0].longMessage;
  if (err?.errors?.[0]?.message) return err.errors[0].message;
  return err?.message || "Something went wrong. Please try again.";
}

function mapClerkCode(code: string, context: "email" | "phone"): string {
  switch (code) {
    case "form_identifier_exists":
      return context === "email"
        ? "An account with this email already exists. Try signing in."
        : "An account with this phone number already exists. Try signing in.";
    case "form_code_incorrect":
      return "Incorrect code. Please check and try again.";
    case "verification_expired":
      return "Code has expired. Please request a new one.";
    case "too_many_requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "";
  }
}

export default function SignUpScreen() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();
  const insets = useSafeAreaInsets();
  const { startOAuthFlow: googleAuth } = useOAuth({ strategy: "oauth_google" });
  const { startOAuthFlow: appleAuth } = useOAuth({ strategy: "oauth_apple" });

  const [activeTab, setActiveTab] = useState<Tab>("social");
  const [error, setError] = useState("");
  const [oAuthLoading, setOAuthLoading] = useState<string | null>(null);

  // Email OTP state
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"input" | "otp">("input");
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone SMS state
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneStep, setPhoneStep] = useState<"input" | "otp">("input");
  const [phoneLoading, setPhoneLoading] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const timer = setTimeout(() => {
        router.replace("/(tabs)" as any);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isSignedIn, router]);

  const resetTabState = (tab: Tab) => {
    setError("");
    if (tab === "email") {
      setEmail("");
      setEmailOtp("");
      setEmailStep("input");
    } else if (tab === "phone") {
      setPhone("");
      setPhoneOtp("");
      setPhoneStep("input");
    }
  };

  const handleTabChange = (tab: Tab) => {
    resetTabState(tab);
    setActiveTab(tab);
  };

  const handleOAuthSignUp = async (provider: "google" | "apple") => {
    try {
      setError("");
      setOAuthLoading(provider);
      const oauthFlow = provider === "google" ? googleAuth : appleAuth;
      const { createdSessionId, setActive: oauthSetActive } = await oauthFlow();
      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId });
      }
    } catch (err: any) {
      setError(getClerkError(err));
      console.error(`${provider} sign-up error:`, err);
    } finally {
      setOAuthLoading(null);
    }
  };

  // ── Email OTP ────────────────────────────────────────────────────────────────

  const handleEmailSendOtp = async () => {
    if (!signUp || !signUpLoaded) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    try {
      setError("");
      setEmailLoading(true);
      await signUp.create({ emailAddress: trimmed });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setEmailStep("otp");
    } catch (err: any) {
      const code = err?.errors?.[0]?.code || "";
      setError(mapClerkCode(code, "email") || getClerkError(err));
      if (code === "form_identifier_exists") {
        setTimeout(() => router.push("/(auth)/sign-in"), 1500);
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailVerifyOtp = async () => {
    if (!signUp || !setActive) return;
    const code = emailOtp.trim();
    if (!code) {
      setError("Please enter the verification code.");
      return;
    }
    try {
      setError("");
      setEmailLoading(true);
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === "missing_requirements") {
        setError("Additional information required. Please contact support.");
        console.warn("Sign-up missing requirements:", result.missingFields);
      }
    } catch (err: any) {
      const clerkCode = err?.errors?.[0]?.code || "";
      setError(mapClerkCode(clerkCode, "email") || getClerkError(err));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailResend = async () => {
    if (!signUp) return;
    try {
      setError("");
      setEmailLoading(true);
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setEmailOtp("");
    } catch (err: any) {
      setError(getClerkError(err));
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Phone SMS OTP ─────────────────────────────────────────────────────────────

  const handlePhoneSendOtp = async () => {
    if (!signUp || !signUpLoaded) return;
    const trimmed = phone.trim();
    if (!trimmed) {
      setError("Please enter your phone number.");
      return;
    }
    if (!trimmed.startsWith("+")) {
      setError("Phone number must start with a country code (e.g. +1).");
      return;
    }
    try {
      setError("");
      setPhoneLoading(true);
      await signUp.create({ phoneNumber: trimmed });
      await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      setPhoneStep("otp");
    } catch (err: any) {
      const code = err?.errors?.[0]?.code || "";
      setError(mapClerkCode(code, "phone") || getClerkError(err));
      if (code === "form_identifier_exists") {
        setTimeout(() => router.push("/(auth)/sign-in"), 1500);
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneVerifyOtp = async () => {
    if (!signUp || !setActive) return;
    const code = phoneOtp.trim();
    if (!code) {
      setError("Please enter the verification code.");
      return;
    }
    try {
      setError("");
      setPhoneLoading(true);
      const result = await signUp.attemptPhoneNumberVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === "missing_requirements") {
        setError("Additional information required. Please contact support.");
        console.warn("Sign-up missing requirements:", result.missingFields);
      }
    } catch (err: any) {
      const clerkCode = err?.errors?.[0]?.code || "";
      setError(mapClerkCode(clerkCode, "phone") || getClerkError(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneResend = async () => {
    if (!signUp) return;
    try {
      setError("");
      setPhoneLoading(true);
      await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      setPhoneOtp("");
    } catch (err: any) {
      setError(getClerkError(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={[styles.backButton, { top: insets.top - 4 }]}
            onPress={() => router.push("/(tabs)" as any)}
          >
            <FontAwesome5 name="arrow-left" size={20} color="#ff1493" />
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>

          <View style={styles.form}>
            {/* Tab switcher */}
            <View style={styles.tabContainer}>
              {(["social", "email", "phone"] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, activeTab === tab && styles.activeTab]}
                  onPress={() => handleTabChange(tab)}
                >
                  <Text
                    style={[styles.tabText, activeTab === tab && styles.activeTabText]}
                  >
                    {tab === "social" ? "Social" : tab === "email" ? "Email" : "Phone"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* ── Social tab ── */}
            {activeTab === "social" && (
              <View style={styles.iconButtonsContainer}>
                <TouchableOpacity
                  style={[styles.iconButton, styles.googleButton]}
                  onPress={() => handleOAuthSignUp("google")}
                  disabled={!!oAuthLoading}
                >
                  {oAuthLoading === "google" ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <FontAwesome5 name="google" size={24} color="#fff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.iconButton, styles.appleButton]}
                  onPress={() => handleOAuthSignUp("apple")}
                  disabled={!!oAuthLoading}
                >
                  {oAuthLoading === "apple" ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <FontAwesome5 name="apple" size={24} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── Email tab ── */}
            {activeTab === "email" && (
              <View style={styles.inputSection}>
                {emailStep === "input" ? (
                  <>
                    <Text style={styles.inputLabel}>Email address</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor="#ffb6d9"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      editable={!emailLoading}
                    />
                    <TouchableOpacity
                      style={[styles.submitButton, emailLoading && styles.submitButtonDisabled]}
                      onPress={handleEmailSendOtp}
                      disabled={emailLoading}
                    >
                      {emailLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Send Code</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.otpHint}>
                      We sent a code to{"\n"}
                      <Text style={styles.otpIdentifier}>{email}</Text>
                    </Text>
                    <Text style={styles.inputLabel}>Verification code</Text>
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      value={emailOtp}
                      onChangeText={setEmailOtp}
                      placeholder="6-digit code"
                      placeholderTextColor="#ffb6d9"
                      keyboardType="number-pad"
                      maxLength={6}
                      autoComplete="one-time-code"
                      editable={!emailLoading}
                    />
                    <TouchableOpacity
                      style={[styles.submitButton, emailLoading && styles.submitButtonDisabled]}
                      onPress={handleEmailVerifyOtp}
                      disabled={emailLoading}
                    >
                      {emailLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Verify &amp; Create Account</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.resendButton, emailLoading && styles.submitButtonDisabled]}
                      onPress={handleEmailResend}
                      disabled={emailLoading}
                    >
                      <Text style={styles.resendText}>Didn't receive it? Resend</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* ── Phone tab ── */}
            {activeTab === "phone" && (
              <View style={styles.inputSection}>
                {phoneStep === "input" ? (
                  <>
                    <Text style={styles.inputLabel}>Phone number</Text>
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+1 555 000 0000"
                      placeholderTextColor="#ffb6d9"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      editable={!phoneLoading}
                    />
                    <Text style={styles.inputHint}>Include country code (e.g. +49, +1)</Text>
                    <TouchableOpacity
                      style={[styles.submitButton, phoneLoading && styles.submitButtonDisabled]}
                      onPress={handlePhoneSendOtp}
                      disabled={phoneLoading}
                    >
                      {phoneLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Send SMS</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.otpHint}>
                      We sent an SMS to{"\n"}
                      <Text style={styles.otpIdentifier}>{phone}</Text>
                    </Text>
                    <Text style={styles.inputLabel}>SMS code</Text>
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      value={phoneOtp}
                      onChangeText={setPhoneOtp}
                      placeholder="6-digit code"
                      placeholderTextColor="#ffb6d9"
                      keyboardType="number-pad"
                      maxLength={6}
                      autoComplete="one-time-code"
                      editable={!phoneLoading}
                    />
                    <TouchableOpacity
                      style={[styles.submitButton, phoneLoading && styles.submitButtonDisabled]}
                      onPress={handlePhoneVerifyOtp}
                      disabled={phoneLoading}
                    >
                      {phoneLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Verify &amp; Create Account</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.resendButton, phoneLoading && styles.submitButtonDisabled]}
                      onPress={handlePhoneResend}
                      disabled={phoneLoading}
                    >
                      <Text style={styles.resendText}>Didn't receive it? Resend</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            <View style={styles.signInContainer}>
              <Text style={styles.signInText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/sign-in")}>
                <Text style={styles.signInLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffe0f0",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 32,
  },
  backButton: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff1493",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  title: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#ff1493",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 17,
    color: "#ff69b4",
    marginBottom: 48,
    textAlign: "center",
  },
  form: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#ff1493",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    alignItems: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#ffe0f0",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    width: "100%",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  activeTab: {
    backgroundColor: "#ff1493",
    shadowColor: "#ff1493",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ff69b4",
  },
  activeTabText: {
    color: "#fff",
  },
  errorText: {
    color: "#ff1744",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    backgroundColor: "#ffebee",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    width: "100%",
  },
  iconButtonsContainer: {
    flexDirection: "row",
    gap: 20,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 32,
    width: "100%",
  },
  iconButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff1493",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  googleButton: {
    backgroundColor: "#4285F4",
  },
  appleButton: {
    backgroundColor: "#000000",
  },
  inputSection: {
    width: "100%",
    marginVertical: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ff1493",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#ffc1e3",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
    backgroundColor: "#fff9fc",
    width: "100%",
    marginBottom: 8,
  },
  otpInput: {
    letterSpacing: 8,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  inputHint: {
    fontSize: 12,
    color: "#ff69b4",
    marginBottom: 12,
  },
  otpHint: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  otpIdentifier: {
    fontWeight: "700",
    color: "#ff1493",
  },
  submitButton: {
    backgroundColor: "#ff1493",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
    marginTop: 4,
    shadowColor: "#ff1493",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  resendButton: {
    marginTop: 12,
    alignItems: "center",
  },
  resendText: {
    color: "#ff69b4",
    fontSize: 14,
    fontWeight: "600",
  },
  signInContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#ffc1e3",
    width: "100%",
  },
  signInText: {
    fontSize: 15,
    color: "#ff69b4",
  },
  signInLink: {
    fontSize: 15,
    color: "#ff1493",
    fontWeight: "700",
  },
});
