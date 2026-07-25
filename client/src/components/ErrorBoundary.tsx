import { Component, ErrorInfo, ReactNode } from 'react';
import { isStaleChunkError, reloadForStaleChunk } from '../utils/lazyWithReload';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reloadingForChunk: boolean;
}

/**
 * Error Boundary component to catch and display React component errors
 * This helps identify runtime errors that would otherwise crash the app
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      reloadingForChunk: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (isStaleChunkError(error)) {
      return {
        hasError: true,
        error,
        errorInfo: null,
        reloadingForChunk: true,
      };
    }
    return {
      hasError: true,
      error,
      errorInfo: null,
      reloadingForChunk: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
    console.error('Component stack:', errorInfo.componentStack);

    if (isStaleChunkError(error) && reloadForStaleChunk()) {
      this.setState({ reloadingForChunk: true });
      return;
    }
    
    this.setState({
      error,
      errorInfo,
      reloadingForChunk: false,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.state.reloadingForChunk) {
        return (
          <div className="card" style={{ padding: '20px', margin: '20px' }}>
            <p>Updating to the latest version…</p>
          </div>
        );
      }

      return (
        <div className="card" style={{ padding: '20px', margin: '20px' }}>
          <h2 style={{ color: '#e74c3c' }}>⚠️ Something went wrong</h2>
          <p style={{ marginBottom: '15px' }}>
            An error occurred while rendering this component. Check the browser console for details.
          </p>
          
          {this.state.error && (
            <div style={{ marginBottom: '15px' }}>
              <strong>Error:</strong>
              <pre style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '10px', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px'
              }}>
                {this.state.error.toString()}
              </pre>
            </div>
          )}
          
          {this.state.errorInfo && (
            <div style={{ marginBottom: '15px' }}>
              <strong>Component Stack:</strong>
              <pre style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '10px', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                maxHeight: '200px'
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </div>
          )}
          
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

