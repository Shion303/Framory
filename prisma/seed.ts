import { getStore } from "../src/server/store/index";

async function main() {
  await getStore().ensureReady();
  console.log("Seed Framory completato.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
