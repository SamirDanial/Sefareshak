import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth, useOAuth, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

type Tab = 'social' | 'email' | 'phone';

function getClerkError(err: any): string {
  if (err?.errors?.[0]?.longMessage) return err.errors[0].longMessage;
  if (err?.errors?.[0]?.message) return err.errors[0].message;
  return err?.message || 'Something went wrong. Please try again.';
}

function mapClerkCode(code: string, context: 'email' | 'phone'): string {
  switch (code) {
    case 'form_identifier_exists':
      return context === 'email'
        ? 'An account with this email already exists. Try signing in.'
        : 'An account with this phone number already exists. Try signing in.';
    case 'form_code_incorrect':
      return 'Incorrect code. Please check and try again.';
    case 'verification_expired':
      return 'Code has expired. Please request a new one.';
    case 'too_many_requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return '';
  }
}

export default function SignUpScreen() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();

  const { startOAuthFlow: googleAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleAuth } = useOAuth({ strategy: 'oauth_apple' });

  const [activeTab, setActiveTab] = useState<Tab>('social');
  const [error, setError] = useState('');
  const [oAuthLoading, setOAuthLoading] = useState<string | null>(null);

  // Email OTP state
  const [email, setEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailStep, setEmailStep] = useState<'input' | 'otp'>('input');
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone SMS state
  const [phone, setPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [phoneLoading, setPhoneLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/' as any);
    }
  }, [isLoaded, isSignedIn, router]);

  const resetTabState = (tab: Tab) => {
    setError('');
    if (tab === 'email') {
      setEmail('');
      setEmailOtp('');
      setEmailStep('input');
    } else if (tab === 'phone') {
      setPhone('');
      setPhoneOtp('');
      setPhoneStep('input');
    }
  };

  const handleTabChange = (tab: Tab) => {
    resetTabState(tab);
    setActiveTab(tab);
  };

  const handleOAuthSignUp = async (provider: 'google' | 'apple') => {
    try {
      setError('');
      setOAuthLoading(provider);
      const oauthFlow = provider === 'google' ? googleAuth : appleAuth;
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
      setError('Please enter your email address.');
      return;
    }
    try {
      setError('');
      setEmailLoading(true);
      await signUp.create({ emailAddress: trimmed });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setEmailStep('otp');
    } catch (err: any) {
      const code = err?.errors?.[0]?.code || '';
      setError(mapClerkCode(code, 'email') || getClerkError(err));
      if (code === 'form_identifier_exists') {
        setTimeout(() => router.push('/(auth)/sign-in' as any), 1500);
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailVerifyOtp = async () => {
    if (!signUp || !setActive) return;
    const code = emailOtp.trim();
    if (!code) {
      setError('Please enter the verification code.');
      return;
    }
    try {
      setError('');
      setEmailLoading(true);
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === 'missing_requirements') {
        setError('Additional information required. Please contact support.');
        console.warn('Sign-up missing requirements:', result.missingFields);
      }
    } catch (err: any) {
      const clerkCode = err?.errors?.[0]?.code || '';
      setError(mapClerkCode(clerkCode, 'email') || getClerkError(err));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailResend = async () => {
    if (!signUp) return;
    try {
      setError('');
      setEmailLoading(true);
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setEmailOtp('');
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
      setError('Please enter your phone number.');
      return;
    }
    if (!trimmed.startsWith('+')) {
      setError('Phone number must start with a country code (e.g. +1).');
      return;
    }
    try {
      setError('');
      setPhoneLoading(true);
      await signUp.create({ phoneNumber: trimmed });
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
      setPhoneStep('otp');
    } catch (err: any) {
      const code = err?.errors?.[0]?.code || '';
      setError(mapClerkCode(code, 'phone') || getClerkError(err));
      if (code === 'form_identifier_exists') {
        setTimeout(() => router.push('/(auth)/sign-in' as any), 1500);
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneVerifyOtp = async () => {
    if (!signUp || !setActive) return;
    const code = phoneOtp.trim();
    if (!code) {
      setError('Please enter the verification code.');
      return;
    }
    try {
      setError('');
      setPhoneLoading(true);
      const result = await signUp.attemptPhoneNumberVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === 'missing_requirements') {
        setError('Additional information required. Please contact support.');
        console.warn('Sign-up missing requirements:', result.missingFields);
      }
    } catch (err: any) {
      const clerkCode = err?.errors?.[0]?.code || '';
      setError(mapClerkCode(clerkCode, 'phone') || getClerkError(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneResend = async () => {
    if (!signUp) return;
    try {
      setError('');
      setPhoneLoading(true);
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
      setPhoneOtp('');
    } catch (err: any) {
      setError(getClerkError(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.background} />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark} />
              <Text style={styles.brandText}>Next Foody</Text>
            </View>

            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Sign up to access the dashboard</Text>

            {/* Tab switcher */}
            <View style={styles.tabContainer}>
              {(['social', 'email', 'phone'] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, activeTab === tab && styles.activeTab]}
                  onPress={() => handleTabChange(tab)}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                    {tab === 'social' ? 'Social' : tab === 'email' ? 'Email' : 'Phone'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* ── Social tab ── */}
            {activeTab === 'social' && (
              <View style={styles.buttonColumn}>
                <TouchableOpacity
                  style={styles.oauthButton}
                  onPress={() => handleOAuthSignUp('google')}
                  disabled={!!oAuthLoading}
                >
                  <View style={styles.oauthLeft}>
                    {oAuthLoading === 'google' ? (
                      <ActivityIndicator color="#111827" size="small" />
                    ) : (
                      <FontAwesome5 name="google" size={18} color="#4b5563" />
                    )}
                  </View>
                  <Text style={styles.oauthText}>Continue with Google</Text>
                  <View style={styles.oauthRight} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.oauthButton}
                  onPress={() => handleOAuthSignUp('apple')}
                  disabled={!!oAuthLoading}
                >
                  <View style={styles.oauthLeft}>
                    {oAuthLoading === 'apple' ? (
                      <ActivityIndicator color="#111827" size="small" />
                    ) : (
                      <FontAwesome5 name="apple" size={20} color="#4b5563" />
                    )}
                  </View>
                  <Text style={styles.oauthText}>Continue with Apple</Text>
                  <View style={styles.oauthRight} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Email tab ── */}
            {activeTab === 'email' && (
              <View style={styles.inputSection}>
                {emailStep === 'input' ? (
                  <>
                    <Text style={styles.inputLabel}>Email address</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor="#6B7280"
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
                        <ActivityIndicator color="#111827" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Send Code</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.otpHint}>
                      We sent a code to{'\n'}
                      <Text style={styles.otpIdentifier}>{email}</Text>
                    </Text>
                    <Text style={styles.inputLabel}>Verification code</Text>
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      value={emailOtp}
                      onChangeText={setEmailOtp}
                      placeholder="6-digit code"
                      placeholderTextColor="#6B7280"
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
                        <ActivityIndicator color="#111827" size="small" />
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
            {activeTab === 'phone' && (
              <View style={styles.inputSection}>
                {phoneStep === 'input' ? (
                  <>
                    <Text style={styles.inputLabel}>Phone number</Text>
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+1 555 000 0000"
                      placeholderTextColor="#6B7280"
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
                        <ActivityIndicator color="#111827" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Send SMS</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.otpHint}>
                      We sent an SMS to{'\n'}
                      <Text style={styles.otpIdentifier}>{phone}</Text>
                    </Text>
                    <Text style={styles.inputLabel}>SMS code</Text>
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      value={phoneOtp}
                      onChangeText={setPhoneOtp}
                      placeholder="6-digit code"
                      placeholderTextColor="#6B7280"
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
                        <ActivityIndicator color="#111827" size="small" />
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

            <View style={styles.switchAuthRow}>
              <Text style={styles.switchAuthText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/sign-in' as any)} disabled={!!oAuthLoading}>
                <Text style={styles.switchAuthLink}>Sign in</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.legalText}>By continuing you agree to our Terms & Privacy Policy.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 32,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 10,
  },
  brandMark: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#EC4899',
  },
  brandText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
    width: '100%',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#EC4899',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#111827',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 14,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    width: '100%',
    textAlign: 'center',
  },
  buttonColumn: {
    width: '100%',
    gap: 12,
  },
  oauthButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  oauthLeft: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthRight: {
    width: 28,
  },
  oauthText: {
    flex: 1,
    textAlign: 'center',
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },
  inputSection: {
    width: '100%',
    marginVertical: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
    width: '100%',
    marginBottom: 8,
  },
  otpInput: {
    letterSpacing: 8,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  inputHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  otpHint: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  otpIdentifier: {
    fontWeight: '700',
    color: '#EC4899',
  },
  submitButton: {
    backgroundColor: '#EC4899',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  resendButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  resendText: {
    color: '#EC4899',
    fontSize: 13,
    fontWeight: '600',
  },
  legalText: {
    marginTop: 18,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  switchAuthRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  switchAuthText: {
    color: '#6b7280',
    fontSize: 13,
  },
  switchAuthLink: {
    color: '#EC4899',
    fontSize: 13,
    fontWeight: '800',
  },
});
