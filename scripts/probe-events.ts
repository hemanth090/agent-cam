import { writeSync } from "node:fs"
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"

const ep = await Service.ensure()
const client = OpenCode.make({ baseUrl: ep.url, headers: Service.headers(ep) })
writeSync(2, `connected to ${ep.url}\n`)

for await (const event of client.event.subscribe()) {
  writeSync(1, JSON.stringify(event) + "\n")
}
