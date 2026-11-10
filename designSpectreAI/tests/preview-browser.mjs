// The supervised preview can broadcast dev-only full-reload while a new browser
// context warms module transforms. Keep each acceptance run on a fixed snapshot:
// forward all other WebSocket traffic, including application messages.
const driver = await import(
  process.env.BROWSER_DRIVER_MODULE ?? "playwright-core"
)
export const chromium = {
  async launch(options) {
    const browser = await driver.chromium.launch(options)
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (options) => {
      const page = await newPage(options)
      await page.routeWebSocket("**/*", (socket) => {
        const url = new URL(socket.url())
        const isVite =
          url.host === new URL(page.url()).host &&
          url.pathname === "/" &&
          url.searchParams.has("token")
        const server = socket.connectToServer()
        server.onMessage((message) => {
          try {
            const payload = JSON.parse(String(message))
            if (payload.type === "full-reload" && isVite) return
          } catch {
            // Binary/non-JSON application messages are forwarded unchanged.
          }
          socket.send(message)
        })
      })
      return page
    }
    return browser
  },
}
