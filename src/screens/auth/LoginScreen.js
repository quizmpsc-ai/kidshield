import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter Email and Password');
      return;
    }
    setLoading(true);
    try {
      await auth().signInWithEmailAndPassword(email.trim(), password);
    } catch (error) {
      let message = 'Login failed. Try again.';
      if (error.code === 'auth/user-not-found') message = 'Account not found. Please Register.';
      if (error.code === 'auth/wrong-password') message = 'Incorrect password.';
      if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
      if (error.code === 'auth/invalid-credential') message = 'Invalid email or password.';
      Alert.alert('Login Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Reset Password', 'Please enter your email first');
      return;
    }
    try {
      await auth().sendPasswordResetEmail(email.trim());
      Alert.alert('Email Sent', 'Check your email for password reset link');
    } catch (e) {
      Alert.alert('Error', 'Could not send reset email');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">

      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoEmoji}>🛡️</Text>
        </View>
        <Text style={styles.logoText}>KidShield</Text>
        <Text style={styles.tagline}>Protecting your child's digital world</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Login</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.muted}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color={COLORS.bg} />
            : <Text style={styles.btnPrimaryText}>Login →</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleForgotPassword}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.registerRow}>
        <Text style={styles.registerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.registerLink}>Register</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingTop: 80, paddingBottom: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logoIcon: {
    width: 72, height: 72, borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoEmoji: { fontSize: 36 },
  logoText: { fontSize: 28, fontFamily: FONTS.displayBlack, color: COLORS.accent, letterSpacing: -1 },
  tagline: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.xl,
    padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.xl,
  },
  cardTitle: { fontSize: 22, fontFamily: FONTS.displayBlack, color: COLORS.text, marginBottom: SPACING.xl, letterSpacing: -0.5 },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 13, color: COLORS.muted, fontFamily: FONTS.medium, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.md, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
    fontSize: 15, fontFamily: FONTS.regular, marginBottom: 0,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  btnPrimary: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center',
    marginTop: SPACING.md, marginBottom: SPACING.md,
  },
  btnPrimaryText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.bg },
  forgotText: { textAlign: 'center', color: COLORS.muted, fontSize: 13 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  registerText: { color: COLORS.muted, fontSize: 14 },
  registerLink: { color: COLORS.accent, fontSize: 14, fontFamily: FONTS.bold },
});