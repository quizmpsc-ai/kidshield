// KidShield — ErrorHandler.js (Session 6)
// Firebase Crashlytics + Error Boundaries + Retry Logic + API Error Handler

import React, { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';

// ══════════════════════════════════════════
// CRASHLYTICS SETUP
// ══════════════════════════════════════════

export const initializeCrashlytics = async (user) => {
  try {
    // Development मध्ये Crashlytics disable (annoying)
    await crashlytics().setCrashlyticsCollectionEnabled(!__DEV__);

    if (user) {
      await crashlytics().setUserId(user.uid);
      await crashlytics().setAttribute('userRole', user.role || 'unknown');
      await crashlytics().setAttribute('appVersion', '1.0.0');
      await crashlytics().setAttribute('sessionId', Date.now().toString());
    }

    console.log('[ErrorHandler] Crashlytics initialized ✅');
  } catch (err) {
    console.error('[ErrorHandler] Crashlytics init failed:', err);
  }
};

export const logError = (error, context = {}) => {
  try {
    if (!__DEV__) {
      // Context attributes
      Object.entries(context).forEach(([key, value]) => {
        crashlytics().setAttribute(key, String(value));
      });

      // Error log
      crashlytics().recordError(
        error instanceof Error ? error : new Error(String(error))
      );
    } else {
      console.error('[ErrorHandler]', error, context);
    }
  } catch (e) {
    console.error('[ErrorHandler] Failed to log error:', e);
  }
};

export const logMessage = (message, level = 'debug') => {
  if (!__DEV__) {
    crashlytics().log(`[${level.toUpperCase()}] ${message}`);
  }
};

// ══════════════════════════════════════════
// RETRY LOGIC
// Network errors साठी exponential backoff
// ══════════════════════════════════════════

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async (
  fn,
  options = {}
) => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,       // 1 second
    maxDelay = 10000,       // 10 seconds max
    retryOn = ['NETWORK_ERROR', 'TIMEOUT', '503', '429'],
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      // Success असल्यास attempt count reset
      if (attempt > 1) {
        console.log(`[ErrorHandler] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;

      // Retry करायचे का?
      const shouldRetry = retryOn.some(
        (code) =>
          error.message?.includes(code) ||
          error.code?.includes(code) ||
          (error.status && error.status.toString().includes(code))
      );

      if (!shouldRetry || attempt === maxAttempts) {
        logError(error, { attempt, maxAttempts });
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelay
      );

      console.log(
        `[ErrorHandler] Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`
      );

      if (onRetry) onRetry(attempt, delay);
      await sleep(delay);
    }
  }

  throw lastError;
};

// ══════════════════════════════════════════
// API ERROR HANDLER
// Consistent error handling for all API calls
// ══════════════════════════════════════════

export class APIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

export const handleAPIError = (error) => {
  if (error instanceof APIError) {
    switch (error.status) {
      case 401:
        return { type: 'AUTH_REQUIRED', message: 'Please log in again' };
      case 403:
        return { type: 'FORBIDDEN', message: 'Access denied' };
      case 429:
        return { type: 'RATE_LIMITED', message: 'Too many requests. Try again later.' };
      case 503:
        return { type: 'SERVICE_UNAVAILABLE', message: 'Server is temporarily down' };
      default:
        return { type: 'API_ERROR', message: error.message };
    }
  }

  if (error.message?.includes('Network')) {
    return { type: 'NETWORK_ERROR', message: 'Check your internet connection' };
  }

  logError(error);
  return { type: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
};

// ══════════════════════════════════════════
// REACT ERROR BOUNDARY
// App crash होण्यापासून वाचवतो
// ══════════════════════════════════════════

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    logError(error, {
      componentStack: errorInfo.componentStack,
      screen: this.props.screenName || 'unknown',
    });

    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            {__DEV__ && this.state.error
              ? this.state.error.message
              : 'The screen encountered an error. Please try again.'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={this.handleReset}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
          {__DEV__ && this.state.errorInfo && (
            <Text style={styles.debugText}>
              {this.state.errorInfo.componentStack}
            </Text>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

// Screen-level wrapper
export const withErrorBoundary = (WrappedComponent, screenName) => {
  return function WithErrorBoundaryWrapper(props) {
    return (
      <ErrorBoundary screenName={screenName}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
};

// ══════════════════════════════════════════
// GLOBAL ERROR HANDLER SETUP
// App.js मध्ये एकदाच call करा
// ══════════════════════════════════════════

export const setupGlobalErrorHandlers = () => {
  // Unhandled Promise rejections
  if (global.HermesInternal) {
    // Hermes engine (React Native 0.70+)
    global.HermesInternal.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (id, error) => {
        console.error('[GlobalError] Unhandled promise rejection:', error);
        logError(error, { type: 'UNHANDLED_PROMISE' });
      },
    });
  }

  // Global JS error handler
  const originalHandler = global.ErrorUtils?.getGlobalHandler();
  global.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    logError(error, { isFatal, type: 'GLOBAL_ERROR' });
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });

  console.log('[ErrorHandler] Global error handlers setup ✅');
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FAFAFA',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  debugText: {
    marginTop: 24,
    fontSize: 10,
    color: '#BDBDBD',
    fontFamily: 'monospace',
  },
});

export default {
  initializeCrashlytics,
  logError,
  logMessage,
  withRetry,
  handleAPIError,
  APIError,
  ErrorBoundary,
  withErrorBoundary,
  setupGlobalErrorHandlers,
};
