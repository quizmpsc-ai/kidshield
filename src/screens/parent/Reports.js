import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
export default function Reports() {
  return <View style={s.c}><Text style={s.t}>Reports</Text></View>;
}
const s = StyleSheet.create({ c:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#060b14'}, t:{color:'#fff',fontSize:18} });