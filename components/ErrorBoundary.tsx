'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
    children: ReactNode;
    fallback?: ReactNode;
};

type ErrorBoundaryState = {
    hasError: boolean;
    error: Error | null;
};

/**
 * ErrorBoundary: 捕捉 React 渲染錯誤的邊界元件
 * 當子元件發生錯誤時，顯示備援 UI 而非整個應用程式崩潰
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex min-h-[400px] items-center justify-center p-8">
                    <div className="max-w-md space-y-4 rounded-3xl border border-red-500/30 bg-surface-900/90 p-8 text-center shadow-2xl">
                        <div className="text-4xl">⚠️</div>
                        <h2 className="text-xl font-bold text-white">發生錯誤</h2>
                        <p className="text-sm text-surface-300">
                            應用程式遇到了意外問題。請嘗試重新整理頁面，或稍後再試。
                        </p>
                        {this.state.error ? <details className="mt-4 rounded-xl border border-surface-700 bg-surface-950/60 p-3 text-left text-xs text-surface-400">
                                <summary className="cursor-pointer font-semibold text-surface-300">技術細節</summary>
                                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
                                    {this.state.error.message}
                                </pre>
                            </details> : null}
                        <div className="flex justify-center gap-3 pt-2">
                            <button
                                className="rounded-full border border-surface-600 px-4 py-2 text-sm font-semibold text-surface-200 transition-all duration-200 hover:border-surface-400 cursor-pointer"
                                type="button"
                                onClick={this.handleReset}
                            >
                                重試
                            </button>
                            <button
                                className="rounded-full bg-gradient-to-r from-primary-500 to-accent-500 px-4 py-2 text-sm font-semibold text-surface-950 shadow-glow transition-all duration-200 hover:from-primary-400 hover:to-accent-400 cursor-pointer"
                                type="button"
                                onClick={() => window.location.reload()}
                            >
                                重新整理頁面
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
