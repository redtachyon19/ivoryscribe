import os from "node:os";

const WEB_PORT = process.env.WEB_PORT || "5173";
const API_PORT = process.env.API_PORT || "4000";

function isPrivateIpv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function collectLanIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) continue;

    for (const entry of addresses) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      ips.push(entry.address);
    }
  }

  return [...new Set(ips)];
}

const lanIps = collectLanIps();

if (lanIps.length === 0) {
  console.log("LAN link helper: No private network IPv4 address found.");
  console.log("LAN link helper: Start the server anyway and use your host machine IP address.");
  process.exit(0);
}

console.log("LAN links for other devices:");
for (const ip of lanIps) {
  console.log(`- Web app: http://${ip}:${WEB_PORT}`);
  console.log(`- Backend: http://${ip}:${API_PORT}`);
}
