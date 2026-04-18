// src/screens/parent/Reports.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Dimensions
} from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 48;

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', border: '#1e2d4a',
};

const CHART_CONFIG = {
  backgroundGradientFrom: '#111d35',
  backgroundGradientTo: '#111d35',
  color: (opacity = 1) => `rgba(0, 212, 255, ${opacity})`,
  labelColor: () => '#8899aa',
  style: { borderRadius: 16 },
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#00d4ff' },
  barPercentage: 0.6,
  decimalPlaces: 0,
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Reports({ route }) {
  const childId = route?.params?.childId;
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week'); // 'week' | 'month'
  const [activeTab, setActiveTab] = useState('usage'); // 'usage' | 'apps' | 'alerts'
  const [weeklyData, setWeeklyData] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [topApps, setTopApps] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [childName, setChildName] = useState('');

  useEffect(() => {
    fetchReports();
  }, [childId, period]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const firestore = (await import('@react-native-firebase/firestore')).default();

      // Child name
      const childDoc = await firestore.collection('users').doc(childId).get();
      setChildName(childDoc.data()?.name || 'Child');

      // Weekly usage
      const now = new Date();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

      const usageSnap = await firestore.collection('usageLogs')
        .where('childId', '==', childId)
        .where('date', '>=', weekAgo)
        .get();

      const dayData = [0, 0, 0, 0, 0, 0, 0];
      const appMap = {};
      let total = 0;

      usageSnap.forEach(doc => {
        const data = doc.data();
        const dayOfWeek = (new Date(data.date.toDate()).getDay() + 6) % 7; // Mon=0
        const mins = Math.round(data.durationMs / 60000);
        dayData[dayOfWeek] += mins;
        total += mins;

        if (!appMap[data.appName]) appMap[data.appName] = 0;
        appMap[data.appName] += mins;
      });

      setWeeklyData(dayData);
      setTotalMinutes(total);

      // Top apps sorted
      const appsArr = Object.entries(appMap)
        .map(([name, mins]) => ({ name, mins }))
        .sort((a, b) => b.mins - a.mins)
        .slice(0, 8);
      setTopApps(appsArr);

      // Alerts
      const alertSnap = await firestore.collection('alerts')
        .where('childId', '==', childId)
        .where('createdAt', '>=', weekAgo)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      setAlerts(alertSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (e) {
      // Use mock data for development
      setWeeklyData([45, 120, 90, 60, 180, 240, 150]);
      setTotalMinutes(885);
      setTopApps([
        { name: 'YouTube', mins: 240 }, { name: 'Instagram', mins: 180 },
        { name: 'PUBG', mins: 160 }, { name: 'WhatsApp', mins: 120 },
        { name: 'Chrome', mins: 90 }, { name: 'Netflix', mins: 95 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const maxDaily = Math.max(...weeklyData, 1);
  const avgDaily = Math.round(totalMinutes / 7);

  const getPieData = () => topApps.slice(0, 5).map((app, i) => ({
    name: app.name.length > 10 ? app.name.substring(0, 10) + '…' : app.name,
    population: app.mins,
    color: ['#00d4ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#a66cff'][i],
    legendFontColor: '#8899aa',
    legendFontSize: 12,
  }));

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={{ color: COLORS.subtext, marginTop: 12 }}>Reports load होत आहेत...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      {/* Header */}
      <Text style={styles.title}>📊 {childName} चे Reports</Text>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {['week', 'month'].map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodBtnText, period === p && { color: '#000' }]}>
              {p === 'week' ? 'या आठवडा' : 'या महिना'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatTime(totalMinutes)}</Text>
          <Text style={styles.summaryLabel}>एकूण वेळ</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatTime(avgDaily)}</Text>
          <Text style={styles.summaryLabel}>दररोज सरासरी</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#ff9900' }]}>{alerts.length}</Text>
          <Text style={styles.summaryLabel}>Alerts</Text>
        </View>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabs}>
        {['usage', 'apps', 'alerts'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: COLORS.accent }]}>
              {tab === 'usage' ? '📈 Usage' : tab === 'apps' ? '📱 Apps' : '🔔 Alerts'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Usage Tab */}
      {activeTab === 'usage' && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>दररोज Screen Time (मिनिटे)</Text>
          <BarChart
            data={{ labels: DAYS, datasets: [{ data: weeklyData }] }}
            width={CHART_WIDTH - 32}
            height={200}
            chartConfig={CHART_CONFIG}
            style={{ borderRadius: 12, marginVertical: 8 }}
            fromZero
            showValuesOnTopOfBars
          />

          {/* Day breakdown */}
          {DAYS.map((day, i) => (
            <View key={day} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{day}</Text>
              <View style={styles.dayBarContainer}>
                <View style={[styles.dayBar, { width: `${(weeklyData[i] / maxDaily) * 100}%` }]} />
              </View>
              <Text style={styles.dayValue}>{formatTime(weeklyData[i])}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Apps Tab */}
      {activeTab === 'apps' && (
        <View>
          {topApps.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>App Usage Distribution</Text>
              <PieChart
                data={getPieData()}
                width={CHART_WIDTH - 32}
                height={180}
                chartConfig={CHART_CONFIG}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="0"
                absolute
              />
            </View>
          )}

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Top Apps</Text>
            {topApps.map((app, i) => (
              <View key={app.name} style={styles.appRow}>
                <View style={styles.appRank}>
                  <Text style={{ color: COLORS.accent, fontWeight: '700' }}>#{i + 1}</Text>
                </View>
                <Text style={styles.appName}>{app.name}</Text>
                <View style={styles.appBarContainer}>
                  <View style={[styles.appBar, {
                    width: `${(app.mins / (topApps[0]?.mins || 1)) * 100}%`,
                    backgroundColor: i === 0 ? '#ff4444' : COLORS.accent,
                  }]} />
                </View>
                <Text style={styles.appTime}>{formatTime(app.mins)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Recent Alerts</Text>
          {alerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={styles.emptyText}>या आठवड्यात कोणते alerts नाहीत</Text>
            </View>
          ) : (
            alerts.map(alert => (
              <View key={alert.id} style={styles.alertRow}>
                <Text style={styles.alertIcon}>
                  {alert.type === 'location' ? '📍' : alert.type === 'app' ? '📱' : '⚠️'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertMsg}>{alert.message}</Text>
                  <Text style={styles.alertTime}>
                    {alert.createdAt?.toDate().toLocaleString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  title: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 16 },

  periodSelector: { flexDirection: 'row', backgroundColor: '#111d35', borderRadius: 12, padding: 4, marginBottom: 20 },
  periodBtn: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  periodBtnActive: { backgroundColor: '#00d4ff' },
  periodBtnText: { color: '#8899aa', fontWeight: '600' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1, backgroundColor: '#111d35', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a',
  },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#00d4ff', marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: '#8899aa', textAlign: 'center' },

  tabs: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#111d35', borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#1e2d4a' },
  tabText: { color: '#8899aa', fontSize: 13, fontWeight: '600' },

  chartCard: {
    backgroundColor: '#111d35', borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a',
  },
  chartTitle: { color: '#ffffff', fontWeight: '700', marginBottom: 12 },

  dayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dayLabel: { color: '#8899aa', width: 36, fontSize: 12 },
  dayBarContainer: { flex: 1, height: 8, backgroundColor: '#1e2d4a', borderRadius: 4, marginHorizontal: 8 },
  dayBar: { height: 8, backgroundColor: '#00d4ff', borderRadius: 4, minWidth: 4 },
  dayValue: { color: '#ffffff', fontSize: 12, width: 44, textAlign: 'right' },

  appRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  appRank: { width: 32 },
  appName: { color: '#ffffff', flex: 1, fontSize: 13 },
  appBarContainer: { flex: 1, height: 6, backgroundColor: '#1e2d4a', borderRadius: 3, marginHorizontal: 8 },
  appBar: { height: 6, borderRadius: 3, minWidth: 4 },
  appTime: { color: '#8899aa', fontSize: 12, width: 40, textAlign: 'right' },

  emptyState: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { color: '#8899aa', marginTop: 12, textAlign: 'center' },

  alertRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1e2d4a' },
  alertIcon: { fontSize: 20, marginRight: 12, marginTop: 2 },
  alertMsg: { color: '#ffffff', fontSize: 13, marginBottom: 4 },
  alertTime: { color: '#8899aa', fontSize: 11 },
});
