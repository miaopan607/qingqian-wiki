import { Compass } from 'lucide-react'

import { EmptyState, LinkButton, Panel } from '../components/ui'

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <Panel>
        <EmptyState
          icon={Compass}
          title="页面不存在"
          description="你访问的地址可能已被删除或从未存在。"
          action={
            <div className="flex gap-2">
              <LinkButton to="/">返回首页</LinkButton>
              <LinkButton to="/gallery" variant="outline">
                去看美图
              </LinkButton>
            </div>
          }
        />
      </Panel>
    </div>
  )
}
