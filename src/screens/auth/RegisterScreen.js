// src/screens/auth/RegisterScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';

const COLORS = {
  bg: '#060b14',
  accent: '#00d4ff',
  card: '#111d35',
  text: '#ffffff',
  subtext: '#8899aa',
  error: '#ff4444',
  success: '#00cc88',
  border: '#1e2d4a',
};

export default function RegisterScreen({ navigation }) {
  const [role, setRole] = useState('parent'); // 'parent' or 'child'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Error', 'सगळे fields भरा');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords जुळत नाहीत');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password कमीत कमी 6 characters असावा');
      return;
    }

    setLoading(true);
    try {
      // Firebase auth
      const { createUserWithEmailAndPassword, updateProfile } = await import('@react-native-firebase/auth').then(m => m.default());
      const userCredential = await createUserWithEmailAndPassword(email.trim(), password);
      await updateProfile(userCredential.user, { displayName: name });

      // Firestore मध्ये user document बनवा
      const firestore = (await import('@react-native-firebase/firestore')).default();
      await firestore.collection('users').doc(userCredential.user.uid).set({
        name: name.trim(),
        email: email.trim(),
        role: role,
        createdAt: firestore.FieldValue.serverTimestamp(),
        children: [],
        parentId: null,
      });

      Alert.alert('Success', 'Account तयार झाले! 🎉', [
        {
          text: 'OK',
          onPress: () => {
            if (role === 'parent') {
              navigation.replace('Dashboard');
            } else {
              navigation.replace('PairingScreen');
            }
          }
        }
      ]);
    } catch (error) {
      let message = 'Registration failed';
      if (error.code === 'auth/email-already-in-use') message = 'हा email आधीच वापरला आहे';
      if (error.code === 'auth/invalid-email') message = 'Invalid email address';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🛡️ KidShield</Text>
          <Text style={styles.title}>नवीन Account बनवा</Text>
          <Text style={styles.subtitle}>तुम्ही कोण आहात ते निवडा</Text>
        </View>

        {/* Role Selector */}
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'parent' && styles.roleBtnActive]}
            onPress={() => setRole('parent')}
          >
            <Text style={styles.roleIcon}>👨‍👩‍👧</Text>
            <Text style={[styles.roleText, role === 'parent' && { color: COLORS.accent }]}>
              Parent
            </Text>
            <Text style={styles.roleDesc}>मुलांवर नजर ठेवा</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, role === 'child' && styles.roleBtnActive]}
            onPress={() => setRole('child')}
          >
            <Text style={styles.roleIcon}>👦</Text>
            <Text style={[styles.roleText, role === 'child' && { color: COLORS.accent }]}>
              Child
            </Text>
            <Text style={styles.roleDesc}>माझे device register करा</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>पूर्ण नाव</Text>
            <TextInput
              style={styles.input}
              placeholder="तुमचे नाव"
              placeholderTextColor={COLORS.subtext}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor={COLORS.subtext}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="कमीत कमी 6 characters"
              placeholderTextColor={COLORS.subtext}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password Confirm करा</Text>
            <TextInput
              style={styles.input}
              placeholder="वरील password पुन्हा टाका"
              placeholderTextColor={COLORS.subtext}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          {/* Info box based on role */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {role === 'parent'
                ? '💡 Parent account मध्ये तुम्ही मुलांचे devices monitor आणि control करू शकता.'
                : '💡 Child account register केल्यावर तुम्हाला Parent चा pairing code विचारला जाईल.'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.registerBtn, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.registerBtnText}>Account बनवा</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginLinkText}>
              आधीच account आहे? <Text style={{ color: COLORS.accent }}>Login करा</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 30 },
  logo: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8899aa' },

  roleContainer: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  roleBtn: {
    flex: 1, backgroundColor: '#111d35', borderRadius: 16,
    padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#1e2d4a',
  },
  roleBtnActive: { borderColor: '#00d4ff', backgroundColor: '#0a1628' },
  roleIcon: { fontSize: 30, marginBottom: 8 },
  roleText: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  roleDesc: { fontSize: 11, color: '#8899aa', textAlign: 'center' },

  form: {},
  inputGroup: { marginBottom: 16 },
  label: { color: '#8899aa', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#111d35', borderRadius: 12, padding: 14,
    color: '#ffffff', fontSize: 15, borderWidth: 1, borderColor: '#1e2d4a',
  },

  infoBox: {
    backgroundColor: '#0a1628', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#00d4ff33', marginBottom: 20, marginTop: 4,
  },
  infoText: { color: '#8899aa', fontSize: 13, lineHeight: 20 },

  registerBtn: {
    backgroundColor: '#00d4ff', borderRadius: 14, padding: 16,
    alignItems: 'center', marginBottom: 16,
  },
  registerBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },

  loginLink: { alignItems: 'center', paddingVertical: 8 },
  loginLinkText: { color: '#8899aa', fontSize: 14 },
});
