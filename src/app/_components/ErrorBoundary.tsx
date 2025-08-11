"use client";

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Paper, Text, Button, Stack, Alert, Group } from '@mantine/core';
import { IconAlertTriangle, IconRefresh, IconBug } from '@tabler/icons-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      errorInfo,
    });
    
    this.props.onError?.(error, errorInfo);
  }

  componentWillUnmount() {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    const delay = Math.min(1000 * Math.pow(2, newRetryCount - 1), 10000);
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: newRetryCount,
    });

    // If this fails again, add a delay before allowing retry
    if (newRetryCount > 1) {
      const timeout = setTimeout(() => {
        // Reset after delay to allow fresh retry
      }, delay);
      this.retryTimeouts.push(timeout);
    }
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Paper p="lg" className="bg-red-900/10 border border-red-700">
          <Stack gap="md">
            <Group gap="sm">
              <IconAlertTriangle size={24} className="text-red-400" />
              <Text size="lg" fw={600} c="red">
                Something went wrong
              </Text>
            </Group>

            <Text size="sm" c="dimmed">
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>

            {this.state.retryCount < 3 && (
              <Group gap="sm">
                <Button
                  size="sm"
                  variant="light"
                  color="red"
                  leftSection={<IconRefresh size={16} />}
                  onClick={this.handleRetry}
                >
                  Try Again {this.state.retryCount > 0 && `(${this.state.retryCount})`}
                </Button>
                
                <Button
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={this.handleReset}
                >
                  Reset
                </Button>
              </Group>
            )}

            {this.state.retryCount >= 3 && (
              <Alert icon={<IconBug size={16} />} color="orange" variant="light">
                <Text size="sm">
                  Multiple retry attempts failed. Please refresh the page or contact support if the problem persists.
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  mt="xs"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              </Alert>
            )}

            {this.props.showDetails && this.state.error && (
              <details className="mt-4">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                  Technical Details
                </summary>
                <pre className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </Stack>
        </Paper>
      );
    }

    return this.props.children;
  }
}

// Functional wrapper for easier use
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}