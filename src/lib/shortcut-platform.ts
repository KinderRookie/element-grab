export function getShortcutPlatform(): 'darwin' | 'win32' | 'linux' {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}
