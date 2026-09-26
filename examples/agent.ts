import { TrustLayer } from "../src/client";

const apiKey = process.env.TRUSTLAYER_API_KEY ?? "tl_public_demodemo12DEADBEEF00000001";
const apiUrl = process.env.TRUSTLAYER_API_URL ?? "http://127.0.0.1:8080";

async function main() {
  const client = new TrustLayer({ apiKey, apiUrl });
  const session = await client.createSession({ type: "agent", modules: ["agent", "bot", "spam"] });
  const result = await client.agent(session).evaluate("agt_demo", "org_dev");
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
