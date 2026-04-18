import React, { Component } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

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
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 20 },
  btn: { backgroundColor: "#4A90E2", padding: 12, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "bold" },
});