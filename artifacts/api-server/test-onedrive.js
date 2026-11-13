import * as XLSX from "xlsx";
import fs from "fs";

const shareUrl = "https://1drv.ms/x/c/caba622def61cb38/IQAABAFTc9qBR7cpKTgR2Lo3AYHW4JrwOU2p8ekBEcgydyI?e=Ohs2xW";

async function testFetch() {
  console.log("Resolvendo link 1drv.ms...");
  const res1 = await fetch(shareUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  console.log("URL final após redirecionamento:", res1.url);
  const text = await res1.text();
  console.log("HTML length:", text.length);

  // Check if there is downloadUrl inside the page or URL params
  const urlObj = new URL(res1.url);
  console.log("Host:", urlObj.hostname);
  console.log("Path:", urlObj.pathname);
  console.log("SearchParams:", urlObj.search);

  // If resid and authkey exist, we can construct download link
  const resid = urlObj.searchParams.get("resid") || urlObj.searchParams.get("id");
  const authkey = urlObj.searchParams.get("authkey");
  console.log("Resid:", resid, "Authkey:", authkey);

  // Check download URL patterns for OneDrive Consumer
  // Pattern 1: https://onedrive.live.com/download?resid=...&authkey=...
  // Pattern 2: replace view.aspx with download.aspx
  let downloadUrl = res1.url.replace(/view\.aspx/i, "download.aspx");
  if (downloadUrl.includes("download.aspx")) {
    console.log("Tentando download.aspx:", downloadUrl);
    const dlRes = await fetch(downloadUrl);
    console.log("download.aspx status:", dlRes.status);
    if (dlRes.ok) {
      const buf = await dlRes.arrayBuffer();
      console.log("Download com sucesso! Tamanho:", buf.byteLength);
      parseExcel(buf);
      return;
    }
  }

  // Pattern 3: downloadUrl in HTML or JSON
  const match = text.match(/https:\/\/[^"'\s]+\.blob\.core\.windows\.net[^"'\s]+/i) ||
                text.match(/https:\/\/onedrive\.live\.com\/download\?[^"'\s]+/i) ||
                text.match(/https:\/\/[^"'\s]+\/download\.aspx\?[^"'\s]+/i);
  if (match) {
    console.log("Download link encontrado no HTML:", match[0]);
    const dlRes = await fetch(match[0]);
    if (dlRes.ok) {
      const buf = await dlRes.arrayBuffer();
      parseExcel(buf);
      return;
    }
  }
}

function parseExcel(buf) {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true, cellText: true });
  console.log("\n✅ Planilha carregada com sucesso!");
  console.log("Abas:", wb.SheetNames);
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    console.log(`\nAba: "${name}" (${data.length} linhas)`);
    for (let i = 0; i < Math.min(10, data.length); i++) {
      console.log(`Linha ${i}:`, JSON.stringify(data[i]?.slice(0, 12)));
    }
  }
}

testFetch().catch(console.error);
