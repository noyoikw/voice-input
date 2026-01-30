import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function getActiveAppName(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`
    )
    return stdout.trim() || null
  } catch (error) {
    console.error('ActiveAppDetector: Failed to get active app', error)
    return null
  }
}

export async function getActiveAppBundleId(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'`
    )
    return stdout.trim() || null
  } catch (error) {
    console.error('ActiveAppDetector: Failed to get bundle id', error)
    return null
  }
}
