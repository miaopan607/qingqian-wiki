import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button, EmptyState, Panel } from './ui'
import { AlertTriangle } from 'lucide-react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { error: Error | null }

// 渲染异常兜底，避免整页白屏
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('页面渲染异常', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Panel>
          <EmptyState
            icon={AlertTriangle}
            title="页面出错了"
            description="请刷新页面重试；若持续出现，请联系管理员。"
            action={
              <Button variant="outline" onClick={() => window.location.reload()}>
                刷新页面
              </Button>
            }
          />
        </Panel>
      </div>
    )
  }
}
