import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking } from "react-native";

export default function SetupWizard({ navigation }) {
  const [step, setStep] = useState(0);
  const permissions = [
    { title: "Usage Access", desc: "App वापर track करायला", action: () => Linking.openSettings() },
    { title: "Accessibility", desc: "App block करायला", action: () => Linking.openSettings() },
    { title: "Location", desc: "Location track करायला", action: () => Linking.openSettings() },
    { title: "Device Admin", desc: "Uninstall रोखायला", action: () => Linking.openSettings() },
  ];
  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>KidShield Setup</Text>
      <Text style={s.subtitle}>खालील permissions द्या</Text>
      {permissions.map((p, i) => (
        <View key={i} style={s.card}>
          <Text style={s.permTitle}>{p.title}</Text>
          <Text style={s.permDesc}>{p.desc}</Text>
          <TouchableOpacity style={s.btn} onPress={p.action}>
            <Text style={s.btnText}>Enable करा</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.doneBtn} onPress={() => navigation?.navigate("ChildHome")}>
        <Text style={s.doneBtnText}>Complete Setup</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6FA", padding: 16 },
  title: { fontSize: 24, fontWeight: "bold", color: "#2C3E50", textAlign: "center", marginTop: 20 },
  subtitle: { fontSize: 14, color: "#7F8C8D", textAlign: "center", marginBottom: 20 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2 },
  permTitle: { fontSize: 16, fontWeight: "bold", color: "#2C3E50" },
  permDesc: { fontSize: 13, color: "#7F8C8D", marginTop: 4, marginBottom: 10 },
  btn: { backgroundColor: "#4A90E2", padding: 10, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold" },
  doneBtn: { backgroundColor: "#27AE60", padding: 16, borderRadius: 12, alignItems: "center", margin: 16 },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});