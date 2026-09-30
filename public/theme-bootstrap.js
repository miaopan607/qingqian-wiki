// 首帧前应用主题，避免深色模式白屏闪烁（独立文件以满足严格 CSP）
;(function () {
  try {
    var stored = localStorage.getItem('qq_theme')
    var mode = stored === 'light' || stored === 'dark' ? stored : 'system'
    var resolved =
      mode === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  } catch (error) {
    /* localStorage 不可用时保持默认主题 */
  }
})()
