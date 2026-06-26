import CustomAlert from '@/app/components/CustomAlert';
import { Colors } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';


const { width, height } = Dimensions.get('window');

export default function SignupScreen() {
  const router = useRouter();


  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);

  // Custom Alert state
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons?: any[];
  }>({ visible: false, title: '', message: '' });

  const showAlert = (title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };

  const onSignup = async () => {
    if (!email || !password || !confirm) {
      showAlert('Missing info', 'Please fill all fields');
      return;
    }
    if (password !== confirm) {
      showAlert('Password mismatch', 'Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || null } },
      });
      if (error) throw error;
      if (data.session) {
        router.replace('/');
      } else {
        setShowOtpInput(true);
        showAlert('Confirm your email', 'Check your inbox for the verification code.');
      }
    } catch (e: any) {
      showAlert('Signup Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      showAlert('Invalid OTP', 'Please enter the 6-digit verification code');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });
      if (error) throw error;
      if (data.session) {
        router.replace('/');
      }
    } catch (e: any) {
      showAlert('Verification Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    try {
      const { error } = await supabase.auth.resend({
        email,
        type: 'signup',
      });
      if (error) throw error;
      showAlert('Code Sent', 'A new verification code has been sent to your email');
    } catch (e: any) {
      showAlert('Error', e.message || String(e));
    }
  };

  const gotoLogin = () => router.push('/(auth)/login');

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient
        colors={['#0F766E', '#10B981']}
        style={styles.gradientBackground}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.headerContainer}>
            <View style={styles.iconContainer}>
              <Text style={{ fontSize: 32 }}>{showOtpInput ? '🔐' : '👤'}</Text>
            </View>
            <Text style={styles.title}>{showOtpInput ? 'Verify Email' : 'Create Account'}</Text>
            <Text style={styles.subtitle}>
              {showOtpInput ? 'Enter the verification code' : 'Join us and stay organized'}
            </Text>
          </View>

          {!showOtpInput ? (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputIcon, { fontSize: 18 }]}>👤</Text>
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Jane Doe"
                    placeholderTextColor={'#8e8e93'}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputIcon, { fontSize: 18 }]}>📧</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                    placeholderTextColor={'#8e8e93'}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputIcon, { fontSize: 18 }]}>🔒</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="********"
                    placeholderTextColor={'#8e8e93'}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputIcon, { fontSize: 18 }]}>🔒</Text>
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    secureTextEntry
                    placeholder="********"
                    placeholderTextColor={'#8e8e93'}
                    style={styles.input}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={onSignup}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.inputIcon, { fontSize: 18 }]}>🔢</Text>
                  <TextInput
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor={'#8e8e93'}
                    style={[styles.input, { letterSpacing: 8 }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={onVerifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify & Sign In'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={resendOtp} style={{ marginTop: 12 }}>
                <Text style={styles.secondaryText}>Resend Code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowOtpInput(false)}
                style={{ marginTop: 8 }}
              >
                <Text style={[styles.secondaryText, { color: '#94A3B8' }]}>
                  ← Back to Sign Up
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={gotoLogin} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.secondaryText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  card: {
    width: width * 0.9,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 30,
    paddingTop: 30,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 54,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    height: '100%',
  },
  button: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '500',
  },
  secondaryText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
