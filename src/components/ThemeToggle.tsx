import { Moon, Sun, SunMoon } from 'lucide-react'

import { useTheme } from '../context/ThemeContext'
import { IconButton } from './ui'

const LABEL: Record<'system' | 'light' | 'dark', string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon

  return (
    <IconButton
      aria-label={`切换主题（当前：${LABEL[theme]}）`}
      onClick={cycleTheme}
      title={LABEL[theme]}
    >
      <Icon className="size-4" />
    </IconButton>
  )
}
