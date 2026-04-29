import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';

// ✅ Fixed: Exported ErrorBoundary properly so App.js can import it!
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.log("Global Error Caught: ", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#060b14', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#ef4444', fontSize: 22, fontWeight: 'bold' }}>⚠️ Crash Prevented!</Text>
          <Text style={{ color: '#8899aa', marginTop: 10, textAlign: 'center', padding: 20 }}>
            {this.state.error ? this.state.error.toString() : "An unknown error occurred."}
          </Text>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const ErrorHandler = {
  logError: (error) => console.log("ErrorHandler Log:", error)
};

export default ErrorHandler;