import pino from 'pino'
import { isProductionRuntime, isTestRuntime } from './runtimeEnv'

const isTest = isTestRuntime()
const verboseIntegrationLogging = process.env.DEBUG_INTEGRATION === '1'

export const logger = pino({
  level: isTest && !verboseIntegrationLogging ? 'error' : 'info',
  transport:
    !isProductionRuntime() && !(isTest && !verboseIntegrationLogging)
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  formatters: {
    level: (label) => ({ level: label }),
    // 日志里不出现明文密码
    log: (object) => {
      if (object.password) object.password = '[REDACTED]'
      return object
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})
