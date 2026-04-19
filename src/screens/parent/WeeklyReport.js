import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

export default function WeeklyReport({ navigation }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const data = [90, 120, 75, 180, 60, 240, 150];
  const maxVal = Math.max(...data);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📈 Weekly Report</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Screen Time This Week</Text>
        <Text style={styles.totalTime}>
          {Math.floor(data.reduce((a,b)=>a+b,0)/60)}h {data.reduce((a,b)=>a+b,0)%60}m total
        </Text>

        {/* Bar chart */}
        <View style={styles.chart}>
          {days.map((day, i) => (
            <View key={day} style={styles.barWrapper}>
              <Text style={styles.barValue}>{data[i]}m</Text>
              <View style={styles.barBg}>
                <View style={[styles.bar, { height: `${(data[i]/maxVal)*100}%` }]} />
              </View>
              <Text style={styles.barLabel}>{day}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Average</Text>
        <Text style={styles.avgValue}>
          {Math.round(data.reduce((a,b)=>a+b,0)/7)} min/day
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>📊 Full reports with real data will appear after child uses the app for a week</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  backBtn: { color: '#00d4ff', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  card: { backgroundColor: '#111d35', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#8899aa', marginBottom: 8 },
  totalTime: { fontSize: 32, fontWeight: '700', color: '#00d4ff', marginBottom: 20 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 8 },
  barWrapper: { flex: 1, alignItems: 'center' },
  barValue: { fontSize: 9, color: '#8899aa', marginBottom: 4 },
  barBg: { flex: 1, width: '100%', backgroundColor: '#0a1628', borderRadius: 6, justifyContent: 'flex-end' },
  bar: { backgroundColor: '#00d4ff', borderRadius: 6, width: '100%' },
  barLabel: { fontSize: 11, color: '#8899aa', marginTop: 6 },
  avgValue: { fontSize: 28, fontWeight: '700', color: '#00cc88' },
  infoCard: { backgroundColor: '#0a1628', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  infoText: { color: '#8899aa', fontSize: 13, lineHeight: 20 },
});