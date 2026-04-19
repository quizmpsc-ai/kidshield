import React, { Component } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

// Crashlytics stub (no dependency needed)
export const initializeCrashlytics = async (user) => {
  console.log('[Crashlytics] User set:', user?.uid);
};

export const setupGlobalErrorHandlers = () => {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[GlobalError]', error?.message, 'Fatal:', isFatal);
    if (originalHandler) originalHandler(error, isFatal);
  });
};

// ErrorBoundary component
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error('[ErrorBoundary]', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>काहीतरी चुकले</Text>
          <TouchableOpacity style={s.btn} onPress={() => this.setState({ hasError: false })}>
            <Text style={s.btnText}>पुन्हा प्रयत्न करा</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default class ErrorHandler extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error("App Error:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>काहीतरी चुकले</Text>
          <TouchableOpacity style={s.btn} onPress={() => this.setState({ hasError: false })}>
            <Text style={s.btnText}>पुन्हा प्रयत्न करा</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: '#060b14' },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 20, color: '#fff' },
  btn: { backgroundColor: "#00d4ff", padding: 12, borderRadius: 8 },
  btnText: { color: "#000", fontWeight: "bold" },
});