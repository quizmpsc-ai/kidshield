// KidShield — WeeklyReport.js (Session 5)
// Weekly Usage Report PDF Generate करतो + Email पाठवतो
// react-native-html-to-pdf वापरतो

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import auth from '@react-native-firebase/auth';
import api from '../../services/api';

const { width } = Dimensions.get('window');
const COLORS = {
  bg: '#060b14', card: '#111d35', accent: '#00d4ff',
  success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
  text: '#ffffff', textMuted: '#8899aa',
};

// ══════════════════════════════════════════
// HTML REPORT TEMPLATE
// Professional PDF साठी HTML template
// ══════════════════════════════════════════
const generateReportHTML = (child, weekData, parentEmail) => {
  const totalMinutes = weekData.dailyUsage.reduce((a, b) => a + b, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const avgMinutes = Math.round(totalMinutes / 7);

  const topAppsRows = (weekData.topApps || [])
    .slice(0, 10)
    .map(
      (app) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${app.appName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${Math.floor(app.minutes / 60)}h ${app.minutes % 60}m</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">
          <span style="background:${app.blocked ? '#fee2e2' : '#dcfce7'};color:${app.blocked ? '#dc2626' : '#16a34a'};padding:2px 8px;border-radius:20px;font-size:12px">
            ${app.blocked ? 'Blocked' : 'Allowed'}
          </span>
        </td>
      </tr>
    `
    )
    .join('');

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const barRows = weekData.dailyUsage
    .map((mins, i) => {
      const pct = Math.min((mins / (child.dailyLimitMinutes || 120)) * 100, 100);
      return `
        <div style="display:flex;align-items:center;margin-bottom:10px;gap:10px">
          <div style="width:36px;font-size:12px;color:#666">${days[i]}</div>
          <div style="flex:1;background:#f0f0f0;border-radius:4px;height:20px;overflow:hidden">
            <div style="width:${pct}%;background:${pct > 90 ? '#dc2626' : pct > 70 ? '#f59e0b' : '#22c55e'};height:100%;border-radius:4px"></div>
          </div>
          <div style="width:50px;text-align:right;font-size:12px;color:#666">${Math.floor(mins / 60)}h${mins % 60}m</div>
        </div>
      `;
    })
    .join('');

  const alertsHtml = (weekData.alerts || [])
    .slice(0, 10)
    .map(
      (a) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${a.time}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${a.type}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px">${a.message}</td>
      </tr>
    `
    )
    .join('');

  const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; }
        .header { background: linear-gradient(135deg, #060b14 0%, #111d35 100%); color: white; padding: 28px; border-radius: 12px; margin-bottom: 24px; }
        .header-logo { font-size: 28px; font-weight: 900; margin-bottom: 4px; }
        .header-sub { font-size: 13px; color: #8899aa; }
        .badge { display: inline-block; background: #00d4ff; color: #060b14; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
        .section { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
        .section-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #1a1a1a; border-left: 4px solid #00d4ff; padding-left: 10px; }
        .stat-grid { display: flex; gap: 12px; flex-wrap: wrap; }
        .stat-box { flex: 1; min-width: 100px; background: #f8fafc; border-radius: 10px; padding: 14px; text-align: center; }
        .stat-val { font-size: 24px; font-weight: 900; color: #060b14; }
        .stat-lbl { font-size: 11px; color: #888; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f4f8; padding: 10px 12px; text-align: left; font-size: 12px; color: #666; }
        .footer { text-align: center; color: #888; font-size: 11px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px; }
        @media print { body { padding: 12px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-logo">🛡️ KidShield</div>
        <div class="header-sub">Parental Control — Weekly Report</div>
        <br>
        <div class="badge">${child.name}</div>
        <span style="font-size:13px;color:#8899aa;margin-left:10px">${weekStart} – ${today}</span>
      </div>

      <!-- Summary Stats -->
      <div class="section">
        <div class="section-title">📊 Weekly Summary</div>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-val">${totalHours}h</div>
            <div class="stat-lbl">Total Screen Time</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${avgMinutes}m</div>
            <div class="stat-lbl">Daily Average</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${weekData.blockedAttempts || 0}</div>
            <div class="stat-lbl">Blocked Attempts</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${weekData.sosAlerts || 0}</div>
            <div class="stat-lbl">SOS Alerts</div>
          </div>
        </div>
      </div>

      <!-- Daily Usage Chart -->
      <div class="section">
        <div class="section-title">📅 Daily Screen Time</div>
        ${barRows}
      </div>

      <!-- Top Apps -->
      <div class="section">
        <div class="section-title">📱 Top Apps Used</div>
        <table>
          <tr>
            <th>App Name</th>
            <th style="text-align:right">Time Used</th>
            <th style="text-align:right">Status</th>
          </tr>
          ${topAppsRows}
        </table>
      </div>

      <!-- Alerts -->
      ${
        weekData.alerts && weekData.alerts.length > 0
          ? `
      <div class="section">
        <div class="section-title">⚠️ Alerts This Week</div>
        <table>
          <tr><th>Time</th><th>Type</th><th>Message</th></tr>
          ${alertsHtml}
        </table>
      </div>`
          : ''
      }

      <div class="footer">
        Generated by KidShield • ${today} • Sent to ${parentEmail}
      </div>
    </body>
    </html>
  `;
};

// ══════════════════════════════════════════
// PDF GENERATOR FUNCTION
// ══════════════════════════════════════════
export const generateWeeklyPDF = async (child, weekData, parentEmail) => {
  const html = generateReportHTML(child, weekData, parentEmail);

  const options = {
    html,
    fileName: `KidShield_${child.name}_Weekly_Report_${new Date().toISOString().slice(0, 10)}`,
    directory: Platform.OS === 'ios' ? 'Documents' : 'Downloads',
    base64: false,
    height: 1122, // A4
    width: 794,
    padding: 0,
  };

  try {
    const file = await RNHTMLtoPDF.convert(options);
    return { success: true, filePath: file.filePath };
  } catch (error) {
    console.error('PDF generation error:', error);
    return { success: false, error: error.message };
  }
};

// Email पाठवणे (backend द्वारे)
export const emailWeeklyReport = async (childId, parentEmail, pdfBase64) => {
  try {
    await api.post('/reports/email', {
      childId,
      parentEmail,
      pdfBase64,
      reportDate: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    return false;
  }
};

// ══════════════════════════════════════════
// WEEKLY REPORT SCREEN
// ══════════════════════════════════════════
export default function WeeklyReport({ route }) {
  const { childId, childName } = route?.params || {};
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const parentEmail = auth().currentUser?.email;

  useEffect(() => {
    fetchWeekData();
  }, [childId]);

  const fetchWeekData = async () => {
    try {
      const res = await api.get(`/reports/weekly/${childId}`);
      setWeekData(res.data);
    } catch (e) {
      Alert.alert('Error', 'Report data load करताना error आला');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!weekData) return;
    setGenerating(true);

    const child = { id: childId, name: childName, dailyLimitMinutes: weekData.dailyLimitMinutes };
    const result = await generateWeeklyPDF(child, weekData, parentEmail);

    if (result.success) {
      Alert.alert(
        '✅ PDF तयार झाला!',
        `File: Downloads मध्ये save झाला`,
        [
          {
            text: 'Share करा',
            onPress: () =>
              Share.share({
                title: `KidShield Weekly Report — ${childName}`,
                url: Platform.OS === 'ios' ? result.filePath : `file://${result.filePath}`,
              }),
          },
          {
            text: 'Email पाठवा',
            onPress: async () => {
              const sent = await emailWeeklyReport(childId, parentEmail, null);
              Alert.alert(sent ? '✅ Email पाठवला!' : '❌ Email error');
            },
          },
          { text: 'Done', style: 'cancel' },
        ]
      );
    } else {
      Alert.alert('Error', `PDF generate करताना error: ${result.error}`);
    }

    setGenerating(false);
  };

  const chartConfig = {
    backgroundGradientFrom: COLORS.card,
    backgroundGradientTo: COLORS.card,
    color: (opacity = 1) => `rgba(0, 212, 255, ${opacity})`,
    labelColor: () => COLORS.textMuted,
    strokeWidth: 2,
    barPercentage: 0.6,
    decimalPlaces: 0,
  };

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Report load होत आहे...</Text>
      </View>
    );
  }

  if (!weekData) return null;

  const totalMinutes = weekData.dailyUsage?.reduce((a, b) => a + b, 0) || 0;
  const totalHours = (totalMinutes / 60).toFixed(1);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Weekly Report</Text>
        <Text style={styles.headerSub}>{childName} — Last 7 Days</Text>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        {[
          { val: `${totalHours}h`, lbl: 'Total Time' },
          { val: weekData.blockedAttempts || 0, lbl: 'Blocked' },
          { val: weekData.sosAlerts || 0, lbl: 'SOS Alerts' },
        ].map((s, i) => (
          <View key={i} style={styles.summaryCard}>
            <Text style={styles.summaryVal}>{s.val}</Text>
            <Text style={styles.summaryLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Bar Chart */}
      {weekData.dailyUsage && (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>📅 Daily Screen Time (minutes)</Text>
          <BarChart
            data={{
              labels: days,
              datasets: [{ data: weekData.dailyUsage }],
            }}
            width={width - 40}
            height={200}
            chartConfig={chartConfig}
            style={styles.chart}
            showValuesOnTopOfBars
            fromZero
          />
        </View>
      )}

      {/* Pie Chart - Top Apps */}
      {weekData.topApps && weekData.topApps.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>📱 Top Apps</Text>
          <PieChart
            data={weekData.topApps.slice(0, 5).map((app, i) => ({
              name: app.appName.length > 10 ? app.appName.slice(0, 10) + '…' : app.appName,
              minutes: app.minutes,
              color: ['#00d4ff', '#7c3aed', '#22c55e', '#f59e0b', '#ef4444'][i],
              legendFontColor: COLORS.textMuted,
              legendFontSize: 11,
            }))}
            width={width - 40}
            height={180}
            chartConfig={chartConfig}
            accessor="minutes"
            backgroundColor="transparent"
            paddingLeft="16"
            style={styles.chart}
          />
        </View>
      )}

      {/* Generate PDF Button */}
      <TouchableOpacity
        style={styles.pdfBtn}
        onPress={handleGeneratePDF}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color={COLORS.bg} />
        ) : (
          <>
            <Text style={styles.pdfBtnIcon}>📄</Text>
            <Text style={styles.pdfBtnText}>PDF Report Generate करा</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.emailBtn}
        onPress={async () => {
          setGenerating(true);
          const sent = await emailWeeklyReport(childId, parentEmail, null);
          setGenerating(false);
          Alert.alert(sent ? '✅ Email पाठवला!' : '❌ Email पाठवताना error');
        }}
        disabled={generating}
      >
        <Text style={styles.emailBtnIcon}>📧</Text>
        <Text style={styles.emailBtnText}>Email वर पाठवा ({parentEmail})</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textMuted, marginTop: 12 },

  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  headerSub: { color: COLORS.textMuted, fontSize: 14, marginTop: 4 },

  summaryRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, alignItems: 'center' },
  summaryVal: { color: COLORS.accent, fontSize: 22, fontWeight: '900' },
  summaryLbl: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },

  chartSection: { marginHorizontal: 20, marginBottom: 20, backgroundColor: COLORS.card, borderRadius: 16, padding: 16 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 14 },
  chart: { borderRadius: 12 },

  pdfBtn: {
    marginHorizontal: 20, marginBottom: 12, backgroundColor: COLORS.accent,
    borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  pdfBtnIcon: { fontSize: 20 },
  pdfBtnText: { color: COLORS.bg, fontWeight: '800', fontSize: 16 },

  emailBtn: {
    marginHorizontal: 20, backgroundColor: COLORS.card,
    borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  emailBtnIcon: { fontSize: 20 },
  emailBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
});
